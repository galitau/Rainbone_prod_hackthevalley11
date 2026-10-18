"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bone, BookOpen, Box, Cloud, LayoutPanelLeft, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { CollapsiblePanel, PANEL_DEFAULT, PanelSplitter, usePanelLayout, type PanelLayoutConfig } from "@/components/overview-layout";
import { createVtkViewDisposer } from "@/lib/dispose-vtk-view";
import { API_BASE_URL } from "@/lib/api";
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
// The patient overview's layout from lg up (components/overview-layout.tsx), remembered separately for this page.
const BONES_LAYOUT: PanelLayoutConfig<"bones" | "sources"> = {
  storageKey: "rainbone.bones-layout.v1",
  layout: { panelWidth: PANEL_DEFAULT, collapsed: { bones: false, sources: false } },
};

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
  const layout = usePanelLayout(BONES_LAYOUT);
  const rowRef = useRef<HTMLDivElement>(null);

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
        const disposeView = createVtkViewDisposer(view);
        const parts: { delete: () => void }[] = [];
        let observer: ResizeObserver | undefined;
        let released = false;
        // Register cleanup before attaching the view or parsing any mesh: a
        // malformed later surface must also release already-created resources.
        cleanup = () => {
          if (released) return;
          released = true;
          observer?.disconnect();
          actorsRef.current = new Map();
          renderRef.current = null;
          resetRef.current = null;
          disposeView();
          parts.splice(0).reverse().forEach(part => part.delete());
        };
        view.setContainer(containerRef.current);
        const renderer = view.getRenderer();
        const actors = new Map<string, vtkActor>();
        const summary: LoadedBone[] = [];
        for (const { file, buffer, integrity } of buffers) {
          const reader = Reader.newInstance();
          parts.push(reader);
          reader.parseAsArrayBuffer(buffer);
          const poly = reader.getOutputData(0) as vtkPolyData;
          if (!poly?.getNumberOfPoints()) { throw new Error(`${file.path} holds no surface.`); }
          const mapper = Mapper.newInstance();
          parts.push(mapper);
          mapper.setInputData(poly);
          const actor = Actor.newInstance();
          parts.push(actor);
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
        observer = new ResizeObserver(() => { if (!released) { view.resize(); render(); } });
        observer.observe(containerRef.current);
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
  const panel = (id: "bones" | "sources", title: string, card: React.ReactNode) => (
    <CollapsiblePanel id={id} title={title} collapsed={layout.collapsed[id]} onCollapsedChange={collapsed => layout.setCollapsed(id, collapsed)}>{card}</CollapsiblePanel>
  );

  // The patient overview's layout: a page header, then from lg up the viewer fills the row, a splitter sets the
  // panel column's width, and the panels scroll on their own and collapse to their header. Below lg it all stacks.
  return (
    <div className="mx-auto max-w-[1440px] p-5 md:p-8 lg:flex lg:min-h-0 lg:w-full lg:max-w-none lg:flex-1 lg:flex-col lg:px-6 lg:pb-3 lg:pt-4">
      <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end lg:shrink-0">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink"><Cloud size={24} className="shrink-0 text-link" aria-hidden /> Pelvic bones from Vultr Object Storage</h1>
          <p className="mt-3 max-w-3xl text-[13px] leading-5 text-body lg:mt-1">
            TotalSegmentator bone meshes of CTPelvic1K CT scans. The browser downloads each mesh from a private bucket
            through a pre-signed link that the API issues for {data ? Math.round(data.expires_in_seconds / 60) : 15} minutes.
          </p>
        </div>
        <div className="flex w-fit shrink-0 items-center gap-2">
          <button type="button" onClick={layout.reset} title="Restore the default panel width and panels" className="hidden items-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink lg:inline-flex"><LayoutPanelLeft size={16} aria-hidden /> Reset layout</button>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Case
            <select aria-label="CT case" value={caseId ?? ""} disabled={!data || status === "loading"} onChange={event => setCaseId(event.target.value)} className="min-w-56 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[12.5px] text-ink shadow-card transition hover:border-line-strong disabled:opacity-40">
              {data?.cases.map(c => <option key={c.case_id} value={c.case_id}>{c.case_id}</option>)}
            </select>
          </label>
        </div>
      </header>

      {listError && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-caution shadow-card lg:mt-4 lg:shrink-0">
        <div className="space-y-1"><p>{listError}</p><p className="text-xs text-muted">The meshes come from a private Vultr bucket through the backend&apos;s GET /api/bones, which needs the VULTR_S3_* keys (they are not in the repo). Without them, run the front end against the live backend: NEXT_PUBLIC_API_BASE_URL=https://api.rainbone.health npm run dev</p></div><button className={buttonClass} onClick={() => void refresh()}>Retry</button>
      </div>}

      {data && selected && <>
        <div ref={rowRef} style={{ "--panel-w": `${layout.panelWidth}px` } as React.CSSProperties} className="mt-6 grid gap-6 lg:mt-4 lg:flex lg:min-h-0 lg:flex-1 lg:gap-0">
          <section aria-label="Interactive pelvic bone meshes" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:min-h-0 lg:flex-1">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Box size={17} className="shrink-0 text-link" aria-hidden /> <span className="truncate">{selected.case_id}</span></h2>
                <p className="mt-0.5 truncate text-[12px] text-muted">{dataset?.name ?? "CTPelvic1K"}</p>
              </div>
              <button disabled={status !== "ready"} onClick={() => resetRef.current?.()} className="shrink-0 rounded-lg border border-line bg-surface p-2 text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-40" aria-label="Reset view" title="Reset view"><RotateCcw size={16} /></button>
            </div>
            <div className="relative mx-3 min-h-[360px] flex-1 overflow-hidden rounded-xl bg-viewport sm:min-h-[440px] lg:min-h-[240px]">
              <div ref={containerRef} role="img" aria-label={`Bone meshes of ${selected.case_id}, anterior view`} className="absolute inset-0 touch-none" />
              {status === "ready" && <p className="pointer-events-none absolute bottom-3 left-3 right-3 text-center text-[11px] text-viewport-ink/70">Anterior view · drag to rotate · scroll to zoom · shift + drag to pan</p>}
              {status === "loading" && <div role="status" className="absolute inset-0 flex items-center justify-center text-[13px] text-viewport-ink"><span className="mr-3 h-3 w-3 animate-pulse rounded-full bg-spectrum-cyan" />Downloading meshes from object storage…</div>}
              {status === "error" && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center"><p className="max-w-sm text-sm text-spectrum-amber">{meshError}</p><button className={buttonClass} onClick={() => { if (urlsFresh(data)) setAttempt(n => n + 1); else void refresh(); }}>Reload</button></div>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-[12px] text-body">
              <span className="flex items-center gap-1.5">
                {status === "ready" && (allVerified
                  ? <><ShieldCheck size={15} className="text-success" aria-hidden /> {loaded.length} meshes, sha256 matches the manifest</>
                  : <><ShieldAlert size={15} className="text-caution" aria-hidden /> {loaded.length} meshes, sha256 not checked (needs https or localhost)</>)}
              </span>
              <span className="font-mono text-[11px] text-muted">{storageHost ? `from ${storageHost}` : ""}{data ? ` · links expire ${new Date(data.validUntil).toLocaleTimeString()}` : ""}</span>
            </div>
          </section>

          <PanelSplitter width={layout.panelWidth} panelsId="bones-panels" rowRef={rowRef} onResize={layout.setPanelWidth} />

          <div id="bones-panels" className="flex min-w-0 flex-col gap-6 lg:min-h-0 lg:w-[var(--panel-w)] lg:max-w-[calc(100%-416px)] lg:shrink-0 lg:gap-4 lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
            {panel("bones", "Bones", <section aria-label="Bones" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold text-ink">Bones</h2>
                <Bone size={17} className="text-link" aria-hidden />
              </div>
              <ul className="px-2 py-2">
                {loaded.map(bone => {
                  const style = BONE_STYLE[bone.name];
                  const record = bonesByName.get(bone.name);
                  const score = style?.dice ? dice[style.dice] : undefined;
                  return (
                    <li key={bone.name}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition hover:bg-sunken">
                        <input type="checkbox" checked={!hidden.has(bone.name)} onChange={() => toggle(bone.name)} className="mt-1 accent-link" />
                        <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: style?.color ?? FALLBACK_COLOR }} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-ink">{style?.label ?? bone.name}</span>
                          <span className="block text-[11px] leading-4 text-muted tabular-nums">
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
              <p className="border-t border-line bg-sunken/60 px-5 py-3 text-[11.5px] leading-5 text-muted">Dice: overlap with the CTPelvic1K expert mask (1 = identical).</p>
            </section>)}

            {panel("sources", "Sources", <section aria-label="Sources and licences" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold text-ink">Sources</h2>
                <BookOpen size={17} className="text-link" aria-hidden />
              </div>
              <div className="space-y-2 px-5 py-4 text-[12px] leading-5 text-muted">
                <p>
                  CT: {dataset?.name ?? "CTPelvic1K"}, Liu et al.,{" "}
                  {dataset?.zenodo_record ? <a className="text-link underline underline-offset-2 hover:decoration-2" href={dataset.zenodo_record} target="_blank" rel="noreferrer">Zenodo{dataset.doi ? ` ${dataset.doi}` : ""}</a> : null}
                  {licenseUrl ? <> · <a className="text-link underline underline-offset-2 hover:decoration-2" href={licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a></> : dataset?.license ? ` · ${dataset.license}` : ""}
                </p>
                <p>{dataset?.changes ?? "Masks and meshes are automatic segmentations derived from the CT, not the dataset's own annotations."}</p>
                <p>
                  Segmentation:{" "}
                  {tool?.repository ? <a className="text-link underline underline-offset-2 hover:decoration-2" href={tool.repository} target="_blank" rel="noreferrer">{tool.name ?? "TotalSegmentator"} {tool.version}</a> : `${tool?.name ?? "TotalSegmentator"} ${tool?.version ?? ""}`}
                  {tool?.license ? ` · ${tool.license.split(" (")[0]}` : ""}
                </p>
              </div>
            </section>)}
          </div>
        </div>
        {/* Under the row like the overview's research note, so collapsing a panel never hides it. */}
        <p className="mt-8 border-t border-line pt-5 text-[11px] leading-5 text-caution lg:mt-3 lg:shrink-0 lg:border-t-0 lg:pt-0 lg:leading-4">Research data, not for clinical use.{tool?.disclaimer ? ` ${tool.disclaimer}` : ""}</p>
      </>}

      {!data && !listError && <div role="status" className="mt-6 rounded-2xl border border-line bg-surface p-6 text-sm text-muted shadow-card lg:mt-4">Asking the API for signed links…</div>}
    </div>
  );
}
