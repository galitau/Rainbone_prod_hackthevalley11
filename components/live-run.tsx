"use client";

import { useRef } from "react";
import { ChevronDown, CircleAlert, LoaderCircle, RotateCw, Upload } from "lucide-react";
import { RunHistory } from "@/components/run-history";
import type { RunState } from "@/components/dashboard";
import { API_BASE_URL, type HistoryState } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { ASSUMED_STRENGTH_MPA, FEMUR_INDEX_PERCENT, FEMUR_MODEL } from "@/lib/model";

type Props = {
  run: RunState;
  history: HistoryState;
  onRunSample: () => void;
  onUpload: (file: File) => void;
};

// Everything behind the headline: the femur's full numbers and method, then the live engine check.
export function LiveRun({ run, history, onRunSample, onUpload }: Props) {
  return (
    <details className="group rounded-2xl border border-line bg-panel shadow-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 text-sm font-medium text-ink transition hover:bg-canvas/70 [&::-webkit-details-marker]:hidden">
        All numbers and method
        <ChevronDown size={16} className="text-muted transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-5 border-t border-line px-5 pb-5 pt-4">
        <FemurNumbers />
        <LiveCheck run={run} history={history} onRunSample={onRunSample} onUpload={onUpload} />
      </div>
    </details>
  );
}

const decimals = (value: number) => (Number.isInteger(value) ? 0 : 2);

function FemurNumbers() {
  const m = FEMUR_MODEL;
  return (
    <section aria-labelledby="femur-numbers-title">
      <h3 id="femur-numbers-title" className="text-caption font-semibold text-ink">
        The femur in the viewer ({m.dataset} {m.caseId})
      </h3>
      <Rows
        rows={[
          ["Load on the hip", `${formatNumber(m.loadNewtons, 0)} N`],
          ["Highest stress, averaged per node (the colour scale)", `${formatNumber(m.shownStressMpa, 2)} MPa`],
          ["Highest stress in a single element", `${formatNumber(m.elementStressMpa, 2)} MPa`],
          ["Largest movement", `${formatNumber(m.maxDisplacementMm, 2)} mm`],
          [`Stress vs. assumed strength (${formatNumber(m.shownStressMpa, 2)} ÷ ${ASSUMED_STRENGTH_MPA})`, `${formatNumber(FEMUR_INDEX_PERCENT, 2)} %`],
          ["Bone volume", `${formatNumber(m.volumeCm3, 2)} cm³`],
          ["Stiffness, one assumed value (Young's modulus)", `${formatNumber(m.youngsModulusGpa, decimals(m.youngsModulusGpa))} GPa`],
          ["Mesh", `${formatNumber(m.elements, 0)} tetrahedra`],
        ]}
      />
      <p className="mt-3 text-label leading-5 text-muted">
        The knee end ({formatNumber(m.supportDepthMm, 0)} mm) is held fixed and {formatNumber(m.loadNewtons, 0)} N presses down on the
        ball of the hip joint. The whole bone gets one assumed stiffness (E = {formatNumber(m.youngsModulusGpa, decimals(m.youngsModulusGpa))}{" "}
        GPa, ν = {m.poissonRatio}), not values from the CT. Solved in {m.solver}, with no mesh-convergence study or clinical validation.
        Not a medical device.
      </p>
    </section>
  );
}

function LiveCheck({ run, history, onRunSample, onUpload }: Props) {
  const result = run.status === "ready" ? run.result : null;
  const sample = run.input.kind === "sample";
  // Only runs of the same input, so the line never mixes different scans.
  const runs = history.status === "ready" ? history.runs.filter((saved) => saved.source_filename === run.input.name) : [];
  return (
    <section aria-labelledby="live-check-title" className="border-t border-line pt-4" aria-busy={run.status === "loading"}>
      <div className="flex items-center justify-between gap-3">
        <h3 id="live-check-title" className="text-caption font-semibold text-ink">
          Live engine check
        </h3>
        <RunBadge run={run} />
      </div>
      <p className="mt-1 text-caption text-muted">
        {sample ? (
          <>
            On each visit this page sends <span className="font-mono text-ink">{run.input.name}</span>, a small synthetic test volume (not
            this femur), to the RainbowBone API and shows what comes back.
          </>
        ) : (
          <>
            Your file <span className="break-all font-mono text-ink">{run.input.name}</span>, sent to the RainbowBone API.
          </>
        )}
      </p>

      {run.status === "error" && (
        <div className="mt-3 rounded-xl border border-warning/25 bg-warning-soft p-3.5">
          <p className="flex items-center gap-2 text-caption font-semibold text-warning">
            <CircleAlert size={16} aria-hidden /> No numbers from the engine
          </p>
          <p className="mt-1 text-caption text-ink">{run.message}</p>
        </div>
      )}
      {run.status === "loading" && (
        <div className="mt-3 space-y-2" aria-label="Solving">
          <span className="block h-3 w-full animate-pulse rounded bg-line" />
          <span className="block h-3 w-3/4 animate-pulse rounded bg-line" />
        </div>
      )}
      {result && run.status === "ready" && (
        <Rows
          rows={[
            ["Stress, 99.5th percentile of the elements", `${formatNumber(result.max_von_mises_stress_mpa, 2)} MPa`],
            ["Stress vs. assumed strength", `${formatNumber(result.fracture_risk_index_percent, 2)} %`],
            ["Average stiffness (Young's modulus)", `${formatNumber(result.average_youngs_modulus_gpa, 2)} GPa`],
            ["Bone volume", `${formatNumber(result.bone_volume_cm3, 2)} cm³`],
            ...(result.load_newtons !== undefined ? [["Load", `${formatNumber(result.load_newtons, 0)} N`] as [string, string]] : []),
            ["Answered in", `${formatNumber(run.ms / 1000, 2)} s`],
          ]}
        />
      )}

      {runs.length > 0 && <RunHistory runs={runs} name={run.input.name} />}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onRunSample} disabled={run.status === "loading"} className={buttonClass}>
          <RotateCw size={14} aria-hidden /> {sample ? "Run the sample again" : "Run the sample"}
        </button>
        <UploadButton disabled={run.status === "loading"} onUpload={onUpload} />
      </div>
    </section>
  );
}

const buttonClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-caption font-medium text-ink shadow-card transition hover:border-accent/40 hover:text-accent disabled:pointer-events-none disabled:opacity-50";

function RunBadge({ run }: { run: RunState }) {
  const where = `POST ${API_BASE_URL}/api/simulate`;
  if (run.status === "loading")
    return (
      <span title={where} className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-label font-medium text-muted">
        <LoaderCircle size={13} className="animate-spin" aria-hidden /> Solving…
      </span>
    );
  if (run.status === "error")
    return <span title={where} className="rounded-full bg-warning-soft px-2.5 py-1 text-label font-medium text-warning">No numbers</span>;
  return (
    <span title={where} className="rounded-full bg-accent-soft px-2.5 py-1 text-label font-medium text-accent">
      Answered in {formatNumber(run.ms / 1000, 1)} s
    </span>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-caption">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="whitespace-nowrap text-right tabular-nums text-ink">{value}</dd>
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
