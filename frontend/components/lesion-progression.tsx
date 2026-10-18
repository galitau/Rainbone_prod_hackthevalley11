"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ruler, ShieldAlert, Waves } from "lucide-react";
import { ProgressionTimeline } from "@/components/progression-timeline";
import { ProgressionViewer } from "@/components/progression-viewer";
import { StressChart } from "@/components/stress-chart";
import { generateProgressionTimeline, type Point3, type ProgressionFrame } from "@/lib/progression-data";

type CoordinatesResponse = { baseline: Point3; followup: Point3 };

export function LesionProgression() {
  const [timeline, setTimeline] = useState<ProgressionFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("http://127.0.0.1:8000/api/progression/coordinates", { signal: controller.signal })
      .then(response => {
        return response.json().then(payload => {
          if (!response.ok) {
            const detail = payload && typeof payload.detail === "string" ? `: ${payload.detail}` : "";
            throw new Error(`Progression data request failed (${response.status})${detail}`);
          }
          return payload as CoordinatesResponse;
        });
      })
      .then(data => setTimeline(generateProgressionTimeline(data.baseline, data.followup)))
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load progression data.");
      });
    return () => controller.abort();
  }, []);

  const frame = timeline[currentFrameIndex];
  return (
    <div className="mx-auto max-w-[1440px] p-5 md:p-8">
      <div className="mb-6"><p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Lesion progression</p><h1 className="mt-2 font-serif text-[28px] font-semibold tracking-[-0.01em] text-ink">Lesion progression</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Review the lesion location from baseline to follow-up across an interpolated 12-month timeline.</p></div>
      {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-caution/30 bg-surface p-4 text-sm text-body"><AlertTriangle size={16} className="text-caution" /> {error}</div>}
      {!frame && !error && <div role="status" className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">Loading baseline and follow-up coordinates…</div>}
      {frame && <div className="space-y-6">
        <ProgressionTimeline timeline={timeline} currentFrameIndex={currentFrameIndex} onSelectFrame={setCurrentFrameIndex} />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <ProgressionViewer frame={frame} active />
            <StressChart activeMonth={frame.month} />
          </div>
          <aside aria-label="Progression clinical metrics" className="h-fit overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-5 py-4"><h2 className="text-[15px] font-semibold text-ink">Clinical metrics</h2><p className="mt-0.5 text-[12px] text-muted">Interpolated frame estimate</p></div>
            <Metric label="Peak von Mises" value={frame.peakVonMisesMPa} unit="MPa" icon={<Waves size={15} />} />
            <Metric label="Fracture risk" value={frame.fractureRiskPercent} unit="%" icon={<ShieldAlert size={15} />} />
            <Metric label="Cortical thickness" value={frame.corticalThicknessMm} unit="mm" icon={<Ruler size={15} />} />
            <Metric label="Lesion volume" value={frame.lesionVolumeCm3} unit="cm³" icon={<Ruler size={15} />} />
            <p className="border-t border-line bg-sunken/60 px-5 py-3.5 text-[11.5px] leading-5 text-muted">Interpolated values are for visualization only and are not a diagnosis.</p>
          </aside>
        </div>
        <div><h2 className="mb-3 text-sm font-semibold text-ink">3D imaging frames</h2><p className="mb-3 text-xs text-muted">All eight cached VTP previews are loaded below. The red marker shrinks with the illustrative interpolated lesion volume.</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{timeline.map(item => <ProgressionViewer key={item.vtpFile} frame={item} active />)}</div></div>
      </div>}
    </div>
  );
}

function Metric({ label, value, unit, icon }: { label: string; value: number; unit: string; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4"><span className="flex items-center gap-2 text-[12.5px] text-body"><span className="text-muted">{icon}</span>{label}</span><span className="font-mono text-[17px] font-medium text-ink">{value}<small className="ml-1 text-[11px] font-normal text-muted">{unit}</small></span></div>;
}
