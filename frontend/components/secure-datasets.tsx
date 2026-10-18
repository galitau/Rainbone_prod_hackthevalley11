"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  Database,
  FileLock2,
  FileUp,
  Fingerprint,
  HardDrive,
  History,
  Info,
  KeyRound,
  Link2,
  Lock,
  ScanLine,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import femurManifest from "@/public/models/hfvalid-femur/manifest.json";
import riskTable from "@/public/models/hfvalid-risk.json";
import { API_HOST, apiUrl, checkHealth } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { GOOGLE_CLIENT_ID } from "@/lib/google-identity";
import { FEMUR_MODEL } from "@/lib/model";
import { RecentAiAnswers } from "@/components/recent-ai-answers";

// Every statement on this page restates what a file in the repository does or holds; the comment above each card
// names the files. Numbers are read from the data files themselves, not typed in.

const HFVALID_DOI = riskTable.source.doi; // 10.6092/unibo/amsacta/8431
const HFVALID_RECORDS = Object.keys(riskTable.subjects).length; // 101
const HFVALID_FRACTURED = Object.values(riskTable.subjects).filter((subject) => subject.fractured_within_followup).length; // 4
const STUDY_CODES = Object.keys(riskTable.subjects).sort();
const CT_SHAPE = femurManifest.source_shape_ijk.join(" × ");
const CT_SPACING = femurManifest.source_spacing_mm.map((mm) => formatNumber(mm, mm % 1 ? 2 : 1)).join(" × ");

// backend/routes_bones.py URL_TTL_SECONDS
const SIGNED_URL_MINUTES = 15;
// backend/services/fea_solver.py MAX_UPLOAD_BYTES
const MAX_UPLOAD_MIB = 512;
// GET /api/history accepts limit 1-500 (backend/routes_history.py)
const HISTORY_LIMIT = 500;

// backend/migrations/001_simulation_runs.sql, in table order.
const HISTORY_COLUMNS = [
  "time", "run_id", "source_filename", "max_von_mises_stress_mpa", "average_youngs_modulus_gpa", "bone_volume_cm3",
  "fracture_risk_index_percent", "load_newtons", "mesh_vertices", "mesh_faces", "solver", "solver_versions", "solve_ms",
];

export function SecureDatasets() {
  return (
    <div className="mx-auto max-w-[1440px] p-5 md:p-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">Secure datasets</h1>
          <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-body">Where each dataset in Rainbone comes from, where it is kept, who can reach it and what happens to a scan you import. Every line restates what the code or the data files in the repository do.</p>
        </div>
        <LiveIndicators />
      </div>

      <p role="note" className="mt-6 flex gap-3 rounded-xl border border-caution/25 bg-caution/[0.06] px-4 py-3 text-[12.5px] leading-5 text-ink">
        <Info size={16} className="mt-0.5 shrink-0 text-caution" aria-hidden />
        <span><strong className="font-semibold">Research prototype — not a medical device.</strong> The HFValid femur and CTPelvic1K pelvic scans come from public research datasets, and the sample the overview runs is a synthetic test volume. There are no real patient accounts: {GOOGLE_CLIENT_ID ? "the clinician in the header is the Dr. Rowan demo profile, or your own Google name and photo if you used Sign in with Google on /enter; those stay in this browser and are never sent to the API, and Google's button sets its own g_state cookie" : "the clinician in the header is a demo profile"}. Only import scans you are allowed to share.</span>
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <HfvalidCard />
        <CtPelvicCard />
        <HistoryCard />
        <UploadCard />
        <div className="min-w-0 xl:col-span-2"><RecentAiAnswers /></div>
        <div className="xl:col-span-2"><KeysCard /></div>
      </div>

      <p className="mt-8 border-t border-line pt-5 text-[11px] leading-5 text-muted">HFValid and CTPelvic1K are published under CC BY 4.0; TotalSegmentator under Apache-2.0. Rainbone&apos;s simulations use assumed material properties and are not validated for clinical diagnosis or treatment decisions.</p>
    </div>
  );
}

// HFValid: frontend/public/models/hfvalid-femur/manifest.json and frontend/public/models/hfvalid-risk.json.
function HfvalidCard() {
  const m = femurManifest.metrics;
  return (
    <Card
      id="hfvalid"
      title="HFValid femur CT"
      subtitle="Aldieri, La Mattina, Szyszko, Baruffaldi, Viceconti (2025) · University of Bologna"
      badge={<Badge tone="neutral" icon={<HardDrive size={12} />}>Static files</Badge>}
      note={<>Changes: Slicer import and export, surface reduction, tetrahedral meshing and a new illustrative finite-element analysis. It does not reproduce the dataset authors&apos; own fracture-risk analyses.</>}
    >
      <Row icon={<Link2 size={14} />} label="Source">
        HFValid collection (Hip-Fracture validation collection), DOI{" "}
        <a className="text-link hover:underline" href={`https://doi.org/${HFVALID_DOI}`} target="_blank" rel="noreferrer">{HFVALID_DOI}</a>
        {" · "}
        <a className="text-link hover:underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">{FEMUR_MODEL.license}</a>
      </Row>
      <Row icon={<ScanLine size={14} />} label="Subject">
        <Mono>{FEMUR_MODEL.caseId}</Mono>, {FEMUR_MODEL.anatomy.toLowerCase()}: CT of {CT_SHAPE} voxels at {CT_SPACING} mm, with the authors&apos; segmentation.
      </Row>
      <Row icon={<ServerCog size={14} />} label="Derived here">
        Slicer {femurManifest.slicer_version} surface of {formatNumber(femurManifest.source_surface_triangles, 0)} triangles; {femurManifest.mesher} mesh of {formatNumber(m.elements, 0)} tetrahedra and {formatNumber(m.nodes, 0)} nodes; {m.solver} linear-elastic solve under {formatNumber(m.load_newtons, 0)} N with an assumed, uniform Young&apos;s modulus of {formatNumber(m.youngs_modulus_mpa / 1000, 0)} GPa.
      </Row>
      <Row icon={<Database size={14} />} label="Risk table">
        The study&apos;s published table: {HFVALID_RECORDS} de-identified records ({STUDY_CODES[0]}–{STUDY_CODES[STUDY_CODES.length - 1]}), each with age, height, weight and side, ARF0 (absolute risk of fracture at time 0), MSF (minimum sideways-fall strength) and the 5-year fracture outcome ({HFVALID_FRACTURED} fractured). No names or dates.
      </Row>
      <Row icon={<HardDrive size={14} />} label="Stored">
        Static files served with the site: <Mono>public/models/hfvalid-femur/</Mono> (meshes, FE results and a manifest describing how they were made) and <Mono>public/models/hfvalid-risk.json</Mono>. Public, read-only research data.
      </Row>
    </Card>
  );
}

// CTPelvic1K: backend/routes_bones.py, frontend/components/CloudBones.tsx, scripts/vultr_pipeline/README.md.
function CtPelvicCard() {
  return (
    <Card
      id="ctpelvic1k"
      title="CTPelvic1K pelvic CT"
      subtitle="Liu et al. (2021) · sub-dataset 6, CLINIC"
      badge={<Badge tone="success" icon={<Lock size={12} />}>Private bucket</Badge>}
      note={<>The masks are automatic segmentations, not reviewed by a clinician: research data, not for clinical use.</>}
    >
      <Row icon={<Link2 size={14} />} label="Source">
        Zenodo record{" "}
        <a className="text-link hover:underline" href="https://doi.org/10.5281/zenodo.4588403" target="_blank" rel="noreferrer">10.5281/zenodo.4588403</a>
        {" · "}
        <a className="text-link hover:underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Sub-dataset 6 is preoperative pelvic-fracture CT, as its authors describe it.
      </Row>
      <Row icon={<ServerCog size={14} />} label="Derived here">
        Three CLINIC cases segmented with{" "}
        <a className="text-link hover:underline" href="https://github.com/wasserth/TotalSegmentator" target="_blank" rel="noreferrer">TotalSegmentator 2.18.0</a>{" "}
        (Apache-2.0): bone masks and one surface mesh per bone, scored against the dataset&apos;s own expert masks.
      </Row>
      <Row icon={<Cloud size={14} />} label="Stored">
        A private Vultr Object Storage bucket, under <Mono>ctpelvic1k/</Mono>: the masks, the meshes and a manifest with each file&apos;s sha256. Nothing in it can be downloaded without a signed link.
      </Row>
      <Row icon={<Timer size={14} />} label="Access">
        <Mono>GET /api/bones</Mono> reads the bucket manifest with the server&apos;s storage key and signs one download link per file, valid {SIGNED_URL_MINUTES} minutes. The browser fetches the meshes straight from the bucket through those links, without the secret key, and gets fresh links first when the current ones are within a minute of expiring.
      </Row>
      <Row icon={<Fingerprint size={14} />} label="Integrity">
        Before a case is drawn, the browser computes the sha256 of every mesh and compares it with the manifest; one mismatch and nothing is drawn. The check needs HTTPS or localhost (Web Crypto); anywhere else the viewer says the meshes were not checked.
      </Row>
    </Card>
  );
}

// Simulation history: backend/services/history.py and backend/migrations/001_simulation_runs.sql.
function HistoryCard() {
  return (
    <Card
      id="history"
      title="Simulation history"
      subtitle="Tiger Cloud · TimescaleDB"
      badge={<Badge tone="neutral" icon={<History size={12} />}>Results only</Badge>}
      note={<>The file name is stored exactly as it was sent and anyone can read it, so name files without patient details.</>}
    >
      <Row icon={<Database size={14} />} label="Table">
        <Mono>simulation_runs</Mono>, a hypertable in 7-day chunks, plus an hourly summary of peak stress (<Mono>simulation_runs_hourly</Mono>). The API writes one row after each successful solve, only when a database is configured; a failed save never fails the solve.
      </Row>
      <Row icon={<FileLock2 size={14} />} label="Columns">
        <span className="flex flex-wrap gap-1.5">
          {HISTORY_COLUMNS.map((column) => <span key={column} className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink">{column}</span>)}
        </span>
        <span className="mt-2 block">The run id is random. There is no column for names, accounts, patient identifiers or the scan itself.</span>
      </Row>
      <Row icon={<Timer size={14} />} label="Retention">
        Not configured: no retention or compression policy, so rows stay until someone deletes them by hand.
      </Row>
      <Row icon={<Link2 size={14} />} label="Who can read it">
        <Mono>GET /api/history</Mono> returns the latest runs (up to {HISTORY_LIMIT}), file names included, to any caller; there is no login.
      </Row>
    </Card>
  );
}

// "Import scan": backend/main.py (POST /api/simulate), backend/services/fea_solver.py, backend/services/fsl_segmentation.py.
function UploadCard() {
  return (
    <Card
      id="uploads"
      title="Scans you import"
      subtitle="Import scan · Solve your own CT"
      badge={<Badge tone="success" icon={<ShieldCheck size={12} />}>File not kept</Badge>}
      note={<>The explanation cards pass numbers to AI providers, not uploaded scans or their file names. Ask Rainbone also sends the question you type and checked source statements; do not put personal or patient details in questions.</>}
    >
      <Row icon={<FileUp size={14} />} label="What is sent">
        One <Mono>.nii</Mono> or <Mono>.nii.gz</Mono> volume of at most {MAX_UPLOAD_MIB} MiB, posted to <Mono>POST /api/simulate</Mono>. The API solves one scan at a time.
      </Row>
      <Row icon={<ServerCog size={14} />} label="Processing">
        The API reads the file into memory and parses it there; its code does not save the upload to the bucket or the database, and writes it to disk only as described next. The web framework (Starlette) buffers uploads larger than 1 MB in a temporary file that is deleted when the request ends. When FSL is installed, the CT volume is written to a temporary folder for two FSL commands and the folder is deleted straight after.
      </Row>
      <Row icon={<History size={14} />} label="Kept afterwards">
        The result numbers and the file name, as a row in the simulation history (when configured). The solver also emits an info-level log record with the file name and solve details; uvicorn&apos;s default logging, which the README&apos;s run command uses, does not print it. When Gemini words the explanation, the result numbers and Gemini&apos;s text are also saved in the API&apos;s answer file (AI_ANSWER_STORE, up to 500 answers), so that when Gemini is unavailable a request with the same numbers gets that Gemini answer back, marked as saved. The scan is not kept.
      </Row>
    </Card>
  );
}

// Keys: backend/services/settings.py, backend/services/explain.py, backend/routes_bones.py, frontend/lib/api.ts,
// frontend/next.config.ts and the deployment section of README.md.
function KeysCard() {
  return (
    <Card
      id="keys"
      title="Keys and secrets"
      subtitle="AI, database and storage credentials"
      badge={<Badge tone="success" icon={<KeyRound size={12} />}>Server only</Badge>}
    >
      <Row icon={<KeyRound size={14} />} label="Where they live">
        The keys are set only on the API server: the Gemini and Groq keys, the database connection string and the lesion-progression storage keys in its environment, <Mono>backend/.env</Mono> or a <Mono>.env</Mono> at the repository root; the <Mono>VULTR_S3_*</Mono> storage keys in its process environment. The API never logs or returns a secret: the signed storage links carry only the access key ID, as S3 requires, never the secret key. The only setting built into the browser code is the API&apos;s address.
      </Row>
      <Row icon={<Link2 size={14} />} label="Same origin">
        With <Mono>API_PROXY_TARGET</Mono> set and <Mono>NEXT_PUBLIC_API_BASE_URL</Mono> pointing at the site, the site forwards <Mono>/api/*</Mono> and <Mono>/health</Mono> to the API, so API calls stay on the site&apos;s own origin. The pelvic meshes still come straight from the Vultr bucket through signed links. This page calls the API at <Mono>{API_HOST}</Mono>.
      </Row>
      <Row icon={<Lock size={14} />} label="In transit">
        In production the site is served over HTTPS by Vercel, and the API sits behind a Caddy HTTPS reverse proxy on Vultr Compute.
      </Row>
      <Row icon={<Sparkles size={14} />} label="AI text">
        Gemini, then a Gemini answer saved earlier for exactly the same numbers (labelled as saved), then Groq, then a built-in template word the explanations. The two explanation cards send the femur&apos;s solved values and {FEMUR_MODEL.caseId}&apos;s published HFValid figures; their text is checked against those facts. Ask Rainbone additionally sends your question and a fixed source-statement catalogue, then renders only checked selections with citations. Uploaded scans are not included in Ask Rainbone.
      </Row>
    </Card>
  );
}

type Live = { engine: boolean | null; cases: number | null; runs: number | null };

// Optional live readings from the API. Each one is hidden when its request fails.
function LiveIndicators() {
  const [live, setLive] = useState<Live>({ engine: null, cases: null, runs: null });

  useEffect(() => {
    let active = true;
    const update = (patch: Partial<Live>) => active && setLive((previous) => ({ ...previous, ...patch }));
    void checkHealth().then((online) => update({ engine: online }));
    void getJson("/api/bones").then((body) => {
      const cases = (body as { cases?: unknown } | null)?.cases;
      update({ cases: Array.isArray(cases) ? cases.length : null });
    });
    void getJson(`/api/history?limit=${HISTORY_LIMIT}`).then((body) => {
      const runs = (body as { runs?: unknown } | null)?.runs;
      update({ runs: Array.isArray(runs) ? runs.length : null });
    });
    return () => {
      active = false;
    };
  }, []);

  const chips = [
    live.engine === true && <LiveChip key="engine" title={`GET ${API_HOST}/health`}>Engine online</LiveChip>,
    live.cases !== null && <LiveChip key="cases" title={`GET ${API_HOST}/api/bones`}>{live.cases} CT {live.cases === 1 ? "case" : "cases"} in the bucket</LiveChip>,
    live.runs !== null && (
      <LiveChip key="runs" title={`GET ${API_HOST}/api/history?limit=${HISTORY_LIMIT}`}>
        {live.runs >= HISTORY_LIMIT ? `${HISTORY_LIMIT}+` : live.runs} saved {live.runs === 1 ? "run" : "runs"}
      </LiveChip>
    ),
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 md:items-end" aria-live="polite">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Live from the API</p>
      <div className="flex flex-wrap gap-2 md:justify-end">{chips}</div>
    </div>
  );
}

async function getJson(path: string): Promise<unknown> {
  try {
    const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8_000) : undefined;
    const response = await fetch(apiUrl(path), { cache: "no-store", signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function LiveChip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span title={title} className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/[0.07] px-2.5 py-1 text-[12px] font-medium text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> {children}
    </span>
  );
}

function Card({ id, title, subtitle, badge, note, children }: { id: string; title: string; subtitle: string; badge: React.ReactNode; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[15px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>
        </div>
        {badge}
      </div>
      <dl className="flex-1 divide-y divide-line">{children}</dl>
      {note && <p className="flex gap-2 border-t border-line bg-sunken/60 px-5 py-3.5 text-[11.5px] leading-5 text-muted"><Info size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{note}</span></p>}
    </section>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 px-5 py-3.5 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-4">
      <dt className="flex items-start gap-2 text-[12.5px] font-medium text-ink"><span className="mt-0.5 text-muted" aria-hidden>{icon}</span>{label}</dt>
      <dd className="min-w-0 text-[12.5px] leading-5 text-body">{children}</dd>
    </div>
  );
}

function Badge({ tone, icon, children }: { tone: "success" | "neutral"; icon: React.ReactNode; children: React.ReactNode }) {
  const style = tone === "success" ? "border-success/25 bg-success/[0.07] text-success" : "border-line bg-sunken text-body";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${style}`}><span aria-hidden>{icon}</span>{children}</span>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="break-words font-mono text-[11.5px] text-ink">{children}</span>;
}
