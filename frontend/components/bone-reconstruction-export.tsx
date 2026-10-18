"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { ReconstructionPreview } from "@/components/reconstruction-preview";
import { RECONSTRUCTION_PATH, type ReconstructionModel } from "@/lib/reconstruction-model";
import type { PressFrame } from "@/lib/press-model";

export function BoneReconstructionExport({ frameIndex, frame, firstBreak, onSelectFrame, onPause }: {
  frameIndex: number;
  frame: PressFrame;
  firstBreak: number;
  onSelectFrame: (index: number) => void;
  onPause: () => void;
}) {
  const [model, setModel] = useState<ReconstructionModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setError(null);
    fetch(`${RECONSTRUCTION_PATH}/manifest.json`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error("The print files could not be loaded."); return response.json(); })
      .then((data: ReconstructionModel) => {
        if (!Array.isArray(data.frames) || !data.frames.every(item => Array.isArray(item.parts) && item.parts.some(part => part.kind === "missing"))) throw new Error("The print report is incomplete.");
        if (!abort.signal.aborted) setModel(data);
      })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "The print files could not be loaded."); });
    return () => abort.abort();
  }, [attempt]);
  const report = model?.frames.find(item => item.frame_index === frameIndex);
  const matching = report && Math.abs(report.stroke_mm - frame.stroke_mm) < 1e-8 && Math.abs(report.raw_eroded_volume_percent - frame.eroded_volume_percent) < 1e-8;
  const missing = report?.parts.filter(part => part.kind === "missing") ?? [];
  const noBreak = frame.eroded_volume_percent === 0;
  const buttonStyle = "flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white hover:bg-primary-hover";

  return <section aria-label="Print missing bone region" className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
    <h3 className="flex items-center gap-2 text-sm font-medium text-ink"><Printer size={16} className="text-link" />Print missing region</h3>
    <p className="text-[11px] leading-5 text-muted">Make a physical reconstruction of the simulated break. Uses the selected compression step.</p>
    {noBreak ? <>
      <p className="rounded-lg bg-sunken p-3 text-[11px] leading-5 text-muted">No missing region at step {frameIndex + 1}. Move to a step after the visible break.</p>
      <button disabled className={`${buttonStyle} cursor-not-allowed opacity-40`}><Download size={14} />Download missing region STL</button>
      {firstBreak >= 0 && <button onClick={() => onSelectFrame(firstBreak)} className="text-xs font-medium text-link hover:underline">Go to first break</button>}
    </> : error ? <div role="alert" className="text-xs text-caution"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)} className="mt-2 underline">Retry print files</button></div> : !model ? <p role="status" className="text-xs text-muted">Loading print files…</p> : !matching || !report ? <p role="alert" className="text-xs text-caution">Matching print files are unavailable for this simulation step.</p> : <div className="grid items-start gap-5">
      {preview && <ReconstructionPreview key={report.frame_index} parts={report.parts} />}
      <div className="min-w-0 space-y-3">
        <div className="rounded-lg bg-sunken px-3 py-2.5">
          <p className="text-xs font-medium text-ink">Step {report.step} · {missing.length} {missing.length === 1 ? "insert" : "insert pieces"}</p>
          <p className="mt-1 font-mono text-[10px] text-muted">{report.print_insert_volume_mm3.toFixed(1)} mm³ · 1:1 scale · mm</p>
          {missing.length === 1 && <p className="mt-1 text-[10px] text-muted">{missing[0].dimensions_mm.map(value => value.toFixed(1)).join(" × ")} mm</p>}
          <p className="mt-1 text-[10px] text-caution">Print repair: +{(100 * report.repair_added_volume_mm3 / report.raw_removed_volume_mm3).toFixed(2)}% insert volume · details below</p>
        </div>
        <button aria-expanded={preview} onClick={() => { onPause(); setPreview(value => !value); }} className="w-full rounded-lg border border-line px-3 py-2 text-xs font-medium text-link hover:bg-sunken">{preview ? "Hide missing-region preview" : "Preview missing region"}</button>
        {missing.map((part, index) => <a key={part.file} href={`${RECONSTRUCTION_PATH}/${part.file}`} download={`HFValid-Pat001-${part.file}`} className={buttonStyle}><Download size={14} />{missing.length === 1 ? "Download missing region STL" : `Download insert ${index + 1} STL`}</a>)}
        <a href={`${RECONSTRUCTION_PATH}/${report.bundle_file}`} download className="flex items-center justify-center gap-2 text-xs font-medium text-link hover:underline"><Download size={13} />Download matching bone + insert ZIP</a>
        <p className="text-[10px] leading-4 text-muted">Print the matching set at the same scale. Original geometry, without the viewer’s ×10 deformation. No fit clearance is applied; check printer tolerances and thin features.</p>
        <details className="border-t border-line pt-3 text-[10px] leading-5 text-muted">
          <summary className="cursor-pointer font-medium text-body">Print preparation &amp; mesh report</summary>
          <p className="mt-2">The simulated missing region is {report.raw_removed_volume_mm3.toFixed(1)} mm³. Repairing pinched edges and vertices and absorbing loose fragments smaller than 5 mm³ adds {report.repair_added_volume_mm3.toFixed(1)} mm³ ({(100 * report.repair_added_volume_mm3 / report.raw_removed_volume_mm3).toFixed(2)}%) to the insert and removes the same volume from the matching bone pieces. No vertices are moved or smoothed.</p>
          <p className="mt-2">Closed surfaces checked after STL export. Import the matching STLs together as parts of one object to inspect assembly in your slicer, then arrange them for printing. Any separate pieces are included in the ZIP.</p>
          <p className="mt-2">This models material hidden by the simulation; it is not an implant or a reconstruction of measured tissue loss.</p>
          <a href={`${RECONSTRUCTION_PATH}/${report.report_file}`} download className="mt-2 inline-block text-link hover:underline">Download reconstruction report</a>
        </details>
      </div>
    </div>}
  </section>;
}
