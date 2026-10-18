"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronDown, CircleAlert, LoaderCircle, RotateCw, Upload } from "lucide-react";
import type { RunState } from "@/components/dashboard";
import { API_BASE_URL, API_HOST, type HistoryState } from "@/lib/api";
import { formatNumber } from "@/lib/format";

// The dashboard opens this panel after "Import scan", so the uploaded file's numbers are in view.
export const ALL_NUMBERS_ID = "all-numbers";

type Props = {
  run: RunState;
  history: HistoryState;
  onRunSample: () => void;
  onUpload: (file: File) => void;
};

// The live engine run: what POST /api/simulate returned for the sample volume or an uploaded CT.
export function LiveRun({ run, history, onRunSample, onUpload }: Props) {
  const sample = run.input.kind === "sample";
  return (
    <details id={ALL_NUMBERS_ID} className="group scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] font-semibold text-ink transition hover:bg-sunken/60 [&::-webkit-details-marker]:hidden">
        All numbers and method
        <ChevronDown size={16} className="text-muted transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-line px-5 pb-5 pt-4" aria-busy={run.status === "loading"}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Live engine run</p>
          <RunBadge run={run} />
        </div>
        <p className="text-[12.5px] leading-5 text-body">
          {run.status === "idle" ? (
            <>
              The automatic check is off in{" "}
              <Link href="/preferences" className="text-link hover:underline">Preferences</Link>. &ldquo;Run the sample&rdquo; sends{" "}
              <span className="font-mono text-ink">{run.input.name}</span>, a small synthetic test volume (not the femur), to the
              RainbowBone API and shows what comes back.
            </>
          ) : sample ? (
            <>
              On each visit this page sends <span className="font-mono text-ink">{run.input.name}</span>, a small synthetic test volume (not
              the femur), to the RainbowBone API and shows what comes back.
            </>
          ) : (
            <>
              Your file <span className="break-all font-mono text-ink">{run.input.name}</span>, sent to the RainbowBone API.
            </>
          )}
        </p>
        {run.status === "error" && (
          <div className="rounded-lg border border-caution/25 bg-caution/[0.08] p-3.5">
            <p className="flex items-center gap-2 text-[12.5px] font-medium text-caution">
              <CircleAlert size={15} aria-hidden /> No numbers from the engine
            </p>
            <p className="mt-1 text-[12.5px] leading-5 text-ink">{run.message}</p>
          </div>
        )}
        {run.status === "loading" && (
          <div className="space-y-2" aria-label="Solving">
            <span className="block h-3 w-full animate-pulse rounded bg-line" />
            <span className="block h-3 w-3/4 animate-pulse rounded bg-line" />
          </div>
        )}
        <AllNumbers run={run} history={history} />
        <p className="text-[11.5px] leading-5 text-muted">
          The API maps CT values to stiffness with a simple linear rule and places the supports and the load by the scan&apos;s extent,
          not by anatomy. Assumed material, no clinical validation. Not a medical device.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRunSample} disabled={run.status === "loading"} className={buttonClass}>
            <RotateCw size={14} aria-hidden /> {sample && run.status !== "idle" ? "Run the sample again" : "Run the sample"}
          </button>
          <UploadButton disabled={run.status === "loading"} onUpload={onUpload} />
        </div>
      </div>
    </details>
  );
}

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink shadow-card transition hover:border-line-strong hover:bg-sunken disabled:pointer-events-none disabled:opacity-50";

function RunBadge({ run }: { run: RunState }) {
  const where = `POST ${API_BASE_URL}/api/simulate`;
  if (run.status === "loading")
    return (
      <span title={where} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1 text-[11px] font-medium text-muted">
        <LoaderCircle size={12} className="animate-spin" aria-hidden /> Solving
      </span>
    );
  if (run.status === "idle")
    return <span title={where} className="rounded-full border border-line bg-sunken px-2.5 py-1 text-[11px] font-medium text-muted">Not run</span>;
  if (run.status === "error")
    return <span title={where} className="rounded-full border border-caution/25 bg-caution/[0.08] px-2.5 py-1 text-[11px] font-medium text-caution">No numbers</span>;
  return <span title={where} className="rounded-full border border-success/25 bg-success/[0.07] px-2.5 py-1 text-[11px] font-medium text-success">From FEA service</span>;
}

function AllNumbers({ run, history }: { run: RunState; history: HistoryState }) {
  const result = run.status === "ready" ? run.result : null;
  const rows: [string, string, boolean?][] = [];
  if (result) {
    rows.push(
      ["Peak stress", `${formatNumber(result.max_von_mises_stress_mpa, 2)} MPa`],
      ["Average stiffness (Young's modulus)", `${formatNumber(result.average_youngs_modulus_gpa, 2)} GPa`],
      ["Bone volume in the model", `${formatNumber(result.bone_volume_cm3, 2)} cm³`],
    );
    if (result.mesh_vertices !== undefined) rows.push(["Mesh surface vertices", formatNumber(result.mesh_vertices, 0)]);
    if (result.mesh_faces !== undefined) rows.push(["Mesh surface triangles", formatNumber(result.mesh_faces, 0)]);
  }
  if (run.status === "ready") rows.push(["Round trip", `${formatNumber(run.ms / 1000, 2)} s`]);
  rows.push(["Input file", run.input.name, true], ["API", API_HOST, true]);
  rows.push([
    "Saved runs",
    history.status === "ready" ? `${history.runs.length} returned` : history.status === "loading" ? "checking…" : `none (${history.reason})`,
  ]);
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[12.5px]">
      {rows.map(([label, value, mono]) => (
        <div key={label} className="contents">
          <dt className="text-body">{label}</dt>
          <dd title={value} className={`text-right tabular-nums text-ink ${mono ? "max-w-[12rem] truncate font-mono" : "whitespace-nowrap font-mono"}`}>
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
