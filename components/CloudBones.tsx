"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import type vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import type vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";

// GET /api/bones (backend/routes_bones.py): the bucket's ctpelvic1k/manifest.json with a
// short-lived pre-signed GET URL on every file. Only the fields this page reads are typed.
type BoneFile = {
  path: string;
  kind: string;
  bone?: string | null;
  url: string;
  bytes: number;
  sha256: string;
  triangles?: number;
};
type BoneRecord = { name: string; volume_ml?: number; touches_scan_z_limit?: boolean };
type BoneCase = {
  case_id: string;
  files: BoneFile[];
  bones?: BoneRecord[];
  validation?: { dice_overlap_matched?: Record<string, number | null> };
  segmentation?: { version?: string; fast?: boolean };
};
type BonesResponse = {
  expires_in_seconds: number;
  expires_at: string;
  dataset: {
    name?: string; zenodo_record?: string; doi?: string; license?: string;
    license_url?: string | null; changes?: string;
  };
  segmentation_tool: { name?: string; version?: string; license?: string; repository?: string; disclaimer?: string };
  cases: BoneCase[];
};
// validUntil: browser time when the signed URLs expire, counted from when the response arrived, so a
// browser clock that differs from the server's cannot make fresh links look expired.
type BonesData = BonesResponse & { validUntil: number };
type Integrity = "verified" | "unchecked";
type LoadedBone = { name: string; triangles: number; bytes: number; integrity: Integrity };

// Same variable and default as the rest of the front end: NEXT_PUBLIC_API_BASE_URL, inlined at build time.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const LICENSE_URLS: Record<string, string> = { "cc-by-4.0": "https://creativecommons.org/licenses/by/4.0/" };
const BONE_STYLE: Record<string, { label: string; color: string; dice?: string }> = {
  sacrum: { label: "Sacrum (incl. S1)", color: "#f2c46d", dice: "sacrum_incl_S1" },
  hip_left: { label: "Left hip", color: "#4fdbd1", dice: "hip_left" },
  hip_right: { label: "Right hip", color: "#8977f4", dice: "hip_right" },
  femur_left: { label: "Left femur", color: "#7fb8ff" },
  femur_right: { label: "Right femur", color: "#f28c8c" },
  vertebrae_L5: { label: "L5 vertebra", color: "#9be37c" },
};
const FALLBACK_COLOR = "#e6e0d1";
// Refresh the signed URLs this long before they expire, so a download never starts on a dying link.
const EXPIRY_MARGIN_MS = 60_000;

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  // crypto.subtle exists only in secure contexts (https, localhost).
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchBones(): Promise<BonesData> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/bones`, { cache: "no-store" });
  } catch {
    throw new Error(`Could not reach the API at ${API_BASE_URL.replace(/^https?:\/\//, "")}.`);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail.slice(0, 240);
    } catch {
      // no JSON body
    }
    throw new Error(`GET /api/bones failed (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
  }
  const data = (await response.json()) as BonesResponse;
  if (!Array.isArray(data.cases)) throw new Error("GET /api/bones answered without a case list.");
  return { ...data, validUntil: Date.now() + data.expires_in_seconds * 1000 };
}

function urlsFresh(data: BonesData | null): data is BonesData {
  // The margin never exceeds a quarter of the lifetime, so short-lived links cannot cause a refresh loop.
  return !!data && data.validUntil - Date.now() > Math.min(EXPIRY_MARGIN_MS, data.expires_in_seconds * 250);
}

export function CloudBones() {
  const containerRef = useRef<HTMLDivElement>(null);
  const actorsRef = useRef<Map<string, vtkActor>>(new Map());
  const renderRef = useRef<(() => void) | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [data, setData] = useState<BonesData | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [meshError, setMeshError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedBone[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      const next = await fetchBones();
      setData(next);
      setCaseId(current => (current && next.cases.some(c => c.case_id === current) ? current : next.cases[0]?.case_id ?? null));
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : "GET /api/bones failed.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = data?.cases.find(c => c.case_id === caseId) ?? null;

  useEffect(() => {
    if (!data || !selected) return;
    if (!urlsFresh(data)) { void refresh(); return; }  // signed URLs about to expire: get new ones first
    const meshes = selected.files.filter(file => file.kind === "mesh" && file.bone);
    if (meshes.length === 0) {
      setLoaded([]);
      setMeshError(`The manifest lists no meshes for ${selected.case_id}.`);
      setStatus("error");
      return;
    }
    const abort = new AbortController();
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    setMeshError(null);
    setLoaded([]);
    setHidden(new Set());

    async function load() {
      try {
        await import("@kitware/vtk.js/Rendering/Profiles/Geometry");
        const [{ default: GenericRenderWindow }, { default: Actor }, { default: Mapper }, { default: Reader }] = await Promise.all([
          import("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"),
          import("@kitware/vtk.js/Rendering/Core/Actor"),
          import("@kitware/vtk.js/Rendering/Core/Mapper"),
          import("@kitware/vtk.js/IO/XML/XMLPolyDataReader"),
        ]);
        // Each mesh comes straight from the bucket through its pre-signed URL; no credentials in the browser.
        const buffers = await Promise.all(meshes.map(async file => {
          const response = await fetch(file.url, { signal: abort.signal });
          if (!response.ok) {
            throw new Error(response.status === 403
              ? "Object storage refused a signed link (HTTP 403). The links may have expired: reload."
              : `Downloading ${file.path} failed (HTTP ${response.status}).`);
          }
          const buffer = await response.arrayBuffer();
          const digest = await sha256Hex(buffer);
          if (digest !== null && digest !== file.sha256) throw new Error(`${file.path} does not match its sha256 in the manifest.`);
          return { file, buffer, integrity: (digest === null ? "unchecked" : "verified") as Integrity };
        }));
        if (disposed || !containerRef.current) return;

        const view = GenericRenderWindow.newInstance({ background: [0.04, 0.07, 0.11], listenWindowResize: false });
        view.setContainer(containerRef.current);
        const renderer = view.getRenderer();
        const parts: { delete: () => void }[] = [];
        const actors = new Map<string, vtkActor>();
        const summary: LoadedBone[] = [];
        for (const { file, buffer, integrity } of buffers) {
          const reader = Reader.newInstance();
          reader.parseAsArrayBuffer(buffer);
          const poly = reader.getOutputData(0) as vtkPolyData;
          if (!poly?.getNumberOfPoints()) { reader.delete(); throw new Error(`${file.path} holds no surface.`); }
          const mapper = Mapper.newInstance();
          mapper.setInputData(poly);
          const actor = Actor.newInstance();
          actor.setMapper(mapper);
          const property = actor.getProperty();
          const [r, g, b] = rgb(BONE_STYLE[file.bone!]?.color ?? FALLBACK_COLOR);
          property.setColor(r, g, b);
          property.setAmbient(0.2);
          property.setDiffuse(0.8);
          property.setSpecular(0.15);
          property.setSpecularPower(20);
          property.setInterpolationToPhong();
          renderer.addActor(actor);
          actors.set(file.bone!, actor);
          parts.push(reader, mapper, actor);
          summary.push({ name: file.bone!, triangles: poly.getNumberOfPolys(), bytes: buffer.byteLength, integrity });
        }
        const render = () => view.getRenderWindow().render();
        const reset = () => {
          // Anterior view in RAS millimetres: camera in front (+A), head (+S) up.
          const camera = renderer.getActiveCamera();
          renderer.resetCamera();
          const focal = camera.getFocalPoint();
          const distance = camera.getDistance();
          camera.setPosition(focal[0], focal[1] + distance, focal[2]);
          camera.setViewUp(0, 0, 1);
          renderer.resetCamera();
          renderer.resetCameraClippingRange();
          render();
        };
        const observer = new ResizeObserver(() => { view.resize(); render(); });
        observer.observe(containerRef.current);
        cleanup = () => {
          observer.disconnect();
          parts.forEach(part => part.delete());
          view.delete();
          actorsRef.current = new Map();
          renderRef.current = null;
          resetRef.current = null;
        };
        actorsRef.current = actors;
        renderRef.current = render;
        resetRef.current = reset;
        view.resize();
        reset();
        setLoaded(summary);
        setStatus("ready");
      } catch (cause) {
        if (disposed) return;
        cleanup?.(); cleanup = undefined;
        setMeshError(cause instanceof Error ? cause.message : "WebGL could not initialize on this device.");
        setStatus("error");
      }
    }
    void load();
    return () => { disposed = true; abort.abort(); cleanup?.(); };
    // data changes when the signed URLs are refreshed; attempt is the retry button.
  }, [data, selected, refresh, attempt]);

  useEffect(() => {
    actorsRef.current.forEach((actor, name) => actor.setVisibility(!hidden.has(name)));
    renderRef.current?.();
  }, [hidden, loaded]);

  function toggle(name: string) {
    setHidden(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const dataset = data?.dataset;
  const tool = data?.segmentation_tool;
  const licenseUrl = dataset?.license_url || (dataset?.license ? LICENSE_URLS[dataset.license] : undefined);
  const storageHost = (() => {
    const url = selected?.files[0]?.url;
    try { return url ? new URL(url).host : null; } catch { return null; }
  })();
  const bonesByName = new Map((selected?.bones ?? []).map(bone => [bone.name, bone]));
  const dice = selected?.validation?.dice_overlap_matched ?? {};
  const allVerified = loaded.length > 0 && loaded.every(bone => bone.integrity === "verified");
  const buttonClass = "rounded-lg border border-line bg-surface shadow-card px-3 py-2 text-xs text-muted transition hover:text-ink disabled:opacity-40";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium"><Cloud size={18} className="text-link" /> Pelvic bones from Vultr Object Storage</h1>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            TotalSegmentator bone meshes of CTPelvic1K CT scans. The browser downloads each mesh from a private bucket
            through a pre-signed link that the API issues for {data ? Math.round(data.expires_in_seconds / 60) : 15} minutes.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Case
          <select aria-label="CT case" value={caseId ?? ""} disabled={!data || status === "loading"} onChange={event => setCaseId(event.target.value)} className={`${buttonClass} min-w-56`}>
            {data?.cases.map(c => <option key={c.case_id} value={c.case_id}>{c.case_id}</option>)}
          </select>
        </label>
      </header>

      {listError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface shadow-card p-4 text-sm text-caution">
        <p>{listError}</p><button className={buttonClass} onClick={() => void refresh()}>Retry</button>
      </div>}

      {data && selected && <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section aria-label="Interactive pelvic bone meshes" className="flex flex-col overflow-hidden rounded-xl border border-line bg-viewport">
          <div className="relative min-h-[440px] flex-1 sm:min-h-[520px]">
            <div ref={containerRef} role="img" aria-label={`Bone meshes of ${selected.case_id}, anterior view`} className="absolute inset-0 touch-none" />
            {status === "ready" && <p className="pointer-events-none absolute bottom-3 left-3 right-3 text-center text-[10px] text-[#7d91a4]">Anterior view · drag to rotate · scroll to zoom · shift + drag to pan</p>}
            {status === "loading" && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-[#7d91a4]"><span className="mr-3 h-3 w-3 animate-pulse rounded-full bg-[#4fdbd1]" />Downloading meshes from object storage…</div>}
            {status === "error" && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center"><p className="max-w-sm text-sm text-[#f8bd72]">{meshError}</p><button className={buttonClass} onClick={() => { if (urlsFresh(data)) setAttempt(n => n + 1); else void refresh(); }}>Reload</button></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              {status === "ready" && (allVerified
                ? <><ShieldCheck size={14} className="text-link" /> {loaded.length} meshes, sha256 matches the manifest</>
                : <><ShieldAlert size={14} className="text-caution" /> {loaded.length} meshes, sha256 not checked (needs https or localhost)</>)}
            </span>
            <span className="font-mono">{storageHost ? `from ${storageHost}` : ""}{data ? ` · links expire ${new Date(data.validUntil).toLocaleTimeString()}` : ""}</span>
            <button disabled={status !== "ready"} onClick={() => resetRef.current?.()} className={buttonClass} aria-label="Reset view"><RotateCcw size={14} /></button>
          </div>
        </section>

        <aside className="space-y-4">
          <section aria-label="Bones" className="rounded-xl border border-line bg-surface shadow-card p-4">
            <h2 className="text-sm font-medium">Bones</h2>
            <p className="mt-1 text-[11px] text-muted">Dice: overlap with the CTPelvic1K expert mask (1 = identical).</p>
            <ul className="mt-3 space-y-2">
              {loaded.map(bone => {
                const style = BONE_STYLE[bone.name];
                const record = bonesByName.get(bone.name);
                const score = style?.dice ? dice[style.dice] : undefined;
                return (
                  <li key={bone.name}>
                    <label className="flex cursor-pointer items-start gap-2 text-xs">
                      <input type="checkbox" checked={!hidden.has(bone.name)} onChange={() => toggle(bone.name)} className="mt-0.5 accent-link" />
                      <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: style?.color ?? FALLBACK_COLOR }} />
                      <span className="flex-1">
                        <span className="text-ink">{style?.label ?? bone.name}</span>
                        <span className="block font-mono text-[10px] text-muted">
                          {record?.volume_ml !== undefined ? `${record.volume_ml.toFixed(1)} mL · ` : ""}
                          {typeof score === "number" ? `Dice ${score.toFixed(3)} · ` : ""}
                          {bone.triangles.toLocaleString()} triangles
                          {record?.touches_scan_z_limit ? " · cut off by the scan" : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Sources and licences" className="space-y-2 rounded-xl border border-line bg-surface shadow-card p-4 text-[11px] leading-5 text-muted">
            <h2 className="text-sm font-medium text-ink">Sources</h2>
            <p>
              CT: {dataset?.name ?? "CTPelvic1K"}, Liu et al.,{" "}
              {dataset?.zenodo_record ? <a className="text-link hover:underline" href={dataset.zenodo_record} target="_blank" rel="noreferrer">Zenodo{dataset.doi ? ` ${dataset.doi}` : ""}</a> : null}
              {licenseUrl ? <> · <a className="text-link hover:underline" href={licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a></> : dataset?.license ? ` · ${dataset.license}` : ""}
            </p>
            <p>{dataset?.changes ?? "Masks and meshes are automatic segmentations derived from the CT, not the dataset's own annotations."}</p>
            <p>
              Segmentation:{" "}
              {tool?.repository ? <a className="text-link hover:underline" href={tool.repository} target="_blank" rel="noreferrer">{tool.name ?? "TotalSegmentator"} {tool.version}</a> : `${tool?.name ?? "TotalSegmentator"} ${tool?.version ?? ""}`}
              {tool?.license ? ` · ${tool.license.split(" (")[0]}` : ""}
            </p>
            <p className="text-caution">Research data, not for clinical use.{tool?.disclaimer ? ` ${tool.disclaimer}` : ""}</p>
          </section>
        </aside>
      </div>}

      {!data && !listError && <div role="status" className="rounded-xl border border-line bg-surface shadow-card p-6 text-sm text-muted">Asking the API for signed links…</div>}
    </div>
  );
}
