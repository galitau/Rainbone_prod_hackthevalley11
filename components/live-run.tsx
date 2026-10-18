"use client";

import { useRef } from "react";
import { ArrowDownToLine, ChevronDown, CircleAlert, Gauge, LoaderCircle, RotateCw, Upload, Zap } from "lucide-react";
import { RunHistory } from "@/components/run-history";
import type { RunState } from "@/components/dashboard";
import { API_HOST, type HistoryState } from "@/lib/api";

// The strength the API divides by (backend: fracture_risk_index_percent = stress / 150 MPa x 100).
const ASSUMED_STRENGTH_MPA = 150;

const number = (value: number, digits: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

type Props = {
  run: RunState;
  history: HistoryState;
  onRunSample: () => void;
  onUpload: (file: File) => void;
};

export function LiveRun({ run, history, onRunSample, onUpload }: Props) {
  const result = run.status === "ready" ? run.result : null;
  const sample = run.input.kind === "sample";
  return (
    <section aria-labelledby="live-run-title" className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="live-run-title" className="text-base font-semibold tracking-tight">Live simulation</h2>
          <RunBadge run={run} />
        </div>
        <p className="mt-1 text-caption text-muted">
          {run.status === "loading" ? "The RainbowBone API is solving " : run.status === "ready" ? "Solved by the RainbowBone API from " : "Input: "}
          <span className="font-mono text-ink">{run.input.name}</span>
          {sample ? ", a synthetic test volume (not anatomy)." : ", the file you uploaded."}
        </p>
      </div>

      {run.status === "error" ? (
        <div className="mx-5 mb-5 mt-4 rounded-xl border border-warning/25 bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-caption font-semibold text-warning">
            <CircleAlert size={16} aria-hidden /> No live numbers right now
          </p>
          <p className="mt-1.5 text-caption text-ink">{run.message}</p>
          <p className="mt-1.5 text-caption text-muted">The 3D femur still works: it was solved ahead of time and loads from this site.</p>
          <button type="button" onClick={onRunSample} className={`${buttonClass} mt-3`}>
            <RotateCw size={14} aria-hidden /> Try again
          </button>
        </div>
      ) : (
        <dl className="mt-2 divide-y divide-line px-5">
          <Metric
            icon={<ArrowDownToLine size={16} aria-hidden />}
            tone="bg-violet-soft text-violet"
            label="Load applied"
            value={result?.load_newtons !== undefined ? number(result.load_newtons, 0) : result ? "—" : null}
            unit="N"
            meaning="The push on the bone in the simulation."
          />
          <Metric
            icon={<Zap size={16} aria-hidden />}
            tone="bg-heat-soft text-heat"
            label="Peak stress"
            value={result ? number(result.max_von_mises_stress_mpa, 1) : null}
            unit="MPa"
            meaning="How hard the bone is squeezed where it is most loaded."
          />
          <Metric
            icon={<Gauge size={16} aria-hidden />}
            tone="bg-accent-soft text-accent"
            label="Stress vs. assumed strength"
            value={result ? number(result.fracture_risk_index_percent, 1) : null}
            unit="%"
            meaning={`Peak stress ÷ an assumed ${ASSUMED_STRENGTH_MPA} MPa bone strength. Illustrative, not a clinical risk.`}
            meter={result ? result.fracture_risk_index_percent : undefined}
          />
        </dl>
      )}

      {history.status === "ready" && history.runs.length > 0 && <RunHistory runs={history.runs} />}

      <details className="group border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-caption font-medium text-ink transition hover:bg-canvas/70 [&::-webkit-details-marker]:hidden">
          All numbers and method
          <ChevronDown size={16} className="text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 px-5 pb-5">
          <AllNumbers run={run} history={history} />
          <p className="text-label leading-5 text-muted">
            The API maps CT values to stiffness with a simple linear rule and places the supports and the load by the scan&apos;s
            extent, not by anatomy. Assumed material, no clinical validation. Not a medical device.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRunSample} disabled={run.status === "loading"} className={buttonClass}>
              <RotateCw size={14} aria-hidden /> Run the sample again
            </button>
            <UploadButton disabled={run.status === "loading"} onUpload={onUpload} />
          </div>
        </div>
      </details>
    </section>
  );
}

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-caption font-medium text-ink shadow-card transition hover:border-accent/40 hover:text-accent disabled:pointer-events-none disabled:opacity-50";

function RunBadge({ run }: { run: RunState }) {
  if (run.status === "loading")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-label font-medium text-muted">
        <LoaderCircle size={13} className="animate-spin" aria-hidden /> Solving…
      </span>
    );
  if (run.status === "error")
    return <span className="rounded-full bg-warning-soft px-2.5 py-1 text-label font-medium text-warning">Not solved</span>;
  return (
    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-label font-medium text-accent">
      Ready in {number(run.ms / 1000, 1)} s
    </span>
  );
}

function Metric({ icon, tone, label, value, unit, meaning, meter }: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string | null; // null while solving
  unit: string;
  meaning: string;
  meter?: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3.5">
      <dt className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-ink">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
        {label}
      </dt>
      <dd className="text-right">
        {value === null ? (
          <span className="block h-8 w-20 animate-pulse rounded-md bg-line">
            <span className="sr-only">Solving</span>
          </span>
        ) : (
          <span className="whitespace-nowrap">
            <span className="text-metric font-semibold tabular-nums text-ink">{value}</span>
            <span className="ml-1 text-sm font-medium text-muted">{unit}</span>
          </span>
        )}
      </dd>
      {meter !== undefined && (
        <dd className="col-span-2 mt-2 h-1.5 overflow-hidden rounded-full bg-accent-soft" aria-hidden>
          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(Math.max(meter, 0), 100)}%` }} />
        </dd>
      )}
      <dd className="col-span-2 mt-1.5 text-caption text-muted">{meaning}</dd>
    </div>
  );
}

function AllNumbers({ run, history }: { run: RunState; history: HistoryState }) {
  const result = run.status === "ready" ? run.result : null;
  const rows: [string, string, boolean?][] = [];
  if (result) {
    rows.push(
      ["Peak stress", `${number(result.max_von_mises_stress_mpa, 2)} MPa`],
      ["Stress vs. assumed strength", `${number(result.fracture_risk_index_percent, 2)} %`],
      ["Average stiffness (Young's modulus)", `${number(result.average_youngs_modulus_gpa, 2)} GPa`],
      ["Bone volume in the model", `${number(result.bone_volume_cm3, 2)} cm³`],
    );
    if (result.load_newtons !== undefined) rows.push(["Load applied", `${number(result.load_newtons, 0)} N`]);
    if (result.mesh_vertices !== undefined) rows.push(["Mesh surface vertices", number(result.mesh_vertices, 0)]);
    if (result.mesh_faces !== undefined) rows.push(["Mesh surface triangles", number(result.mesh_faces, 0)]);
  }
  if (run.status === "ready") rows.push(["Round trip", `${number(run.ms / 1000, 2)} s`]);
  rows.push(["Input file", run.input.name, true], ["API", API_HOST, true]);
  rows.push([
    "Saved runs",
    history.status === "ready" ? `${history.runs.length} returned` : history.status === "loading" ? "checking…" : `none (${history.reason})`,
  ]);
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-caption">
      {rows.map(([label, value, mono]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd title={value} className={`text-right tabular-nums text-ink ${mono ? "max-w-[13rem] truncate font-mono" : "whitespace-nowrap"}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function UploadButton({ disabled, onUpload }: { disabled: boolean; onUpload: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".nii,.gz"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = "";
        }}
      />
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={buttonClass}>
        <Upload size={14} aria-hidden /> Solve your own CT
      </button>
    </>
  );
}
