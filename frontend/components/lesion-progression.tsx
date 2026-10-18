"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LayoutPanelLeft, Ruler, ShieldAlert, Waves } from "lucide-react";
import { CollapsiblePanel, PANEL_DEFAULT, PanelSplitter, usePanelLayout, type PanelLayoutConfig } from "@/components/overview-layout";
import { ProgressionTimeline } from "@/components/progression-timeline";
import { ProgressionViewer } from "@/components/progression-viewer";
import { StressChart } from "@/components/stress-chart";
import { generateProgressionTimeline, type Point3, type ProgressionFrame } from "@/lib/progression-data";
import { apiUrl } from "@/lib/api";

type CoordinatesResponse = { baseline: Point3; followup: Point3 };

// From lg up the page fits the window like the patient overview: the selected frame's viewer fills the row and the
// other cards are collapsible panels in a resizable column. Every panel starts open, as the page looks without a
// saved layout.
type ProgressionPanel = "timeline" | "stress" | "values" | "frames";
const PROGRESSION_LAYOUT: PanelLayoutConfig<ProgressionPanel> = {
  storageKey: "rainbone.progression-layout.v1",
  layout: { panelWidth: PANEL_DEFAULT, collapsed: { timeline: false, stress: false, values: false, frames: false } },
};

export function LesionProgression() {
  const [timeline, setTimeline] = useState<ProgressionFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const layout = usePanelLayout(PROGRESSION_LAYOUT);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(apiUrl("/api/progression/coordinates"), { signal: controller.signal })
      .then(response => {
        return response.json().then(payload => {
          if (!response.ok) {
            const detail = payload && typeof payload.detail === "string" ? `: ${payload.detail}` : "";
            throw new Error(`Progression data request failed (${response.status})${detail}`);
          }
          return payload as CoordinatesResponse;
        });
      })
      .then(data => {
        if (!controller.signal.aborted) setTimeline(generateProgressionTimeline(data.baseline, data.followup));
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load progression data.");
      });
    return () => controller.abort();
  }, [attempt]);

  const frame = timeline[currentFrameIndex];
  const panel = (id: ProgressionPanel, title: string, card: React.ReactNode, className?: string) => (
    <CollapsiblePanel id={id} title={title} collapsed={layout.collapsed[id]} onCollapsedChange={collapsed => layout.setCollapsed(id, collapsed)} className={className}>{card}</CollapsiblePanel>
  );
  // Above the viewer below lg, as before; from lg up the first panel.
  const playback = <ProgressionTimeline timeline={timeline} currentFrameIndex={currentFrameIndex} onSelectFrame={setCurrentFrameIndex} />;
  return (
    <div className="mx-auto max-w-[1440px] p-5 md:p-8 lg:flex lg:min-h-0 lg:w-full lg:max-w-none lg:flex-1 lg:flex-col lg:px-6 lg:pb-3 lg:pt-4">
      <div className="mb-6 lg:mb-0 lg:shrink-0">
        <div className="flex items-start justify-between gap-4">
          {/* From lg up the eyebrow is left out: it repeats the title and the breadcrumb. */}
          <div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted lg:hidden">Lesion progression</p><h1 className="mt-2 font-serif text-[28px] font-semibold tracking-[-0.01em] text-ink lg:mt-0 lg:leading-tight">Lesion progression</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted lg:mt-0.5 lg:max-w-none lg:leading-5">Explore baseline and follow-up annotation locations through an illustrative transition.</p></div>
          {frame && <button type="button" onClick={layout.reset} title="Restore the default panel width and panels" className="hidden shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink lg:inline-flex"><LayoutPanelLeft size={16} aria-hidden /> Reset layout</button>}
        </div>
        <p className="mt-3 rounded-lg border border-caution/30 bg-surface px-4 py-3 text-xs leading-5 text-body lg:py-2">Visualization demo: intermediate frames, the 12-month scale, and all metric values below are illustrative placeholders. They are not measured clinical progression, a new stress solve, or a fracture prediction. The red sphere is an annotation marker, not a segmented lesion.</p>
      </div>
      {error && <div role="alert" className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-caution/30 bg-surface p-4 text-sm text-body lg:mb-0 lg:mt-3"><AlertTriangle size={16} className="text-caution" /> {error}<button onClick={() => setAttempt(value => value + 1)} className="ml-auto rounded-lg border border-line px-3 py-2 text-link">Retry progression data</button></div>}
      {!frame && !error && <div role="status" className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted lg:mt-3">Loading baseline and follow-up coordinates…</div>}
      {frame && <div ref={rowRef} style={{ "--panel-w": `${layout.panelWidth}px` } as React.CSSProperties} className="grid gap-6 lg:mt-3 lg:flex lg:min-h-0 lg:flex-1 lg:gap-0">
        <div className="min-w-0 space-y-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:space-y-0 lg:[&>section]:flex lg:[&>section]:min-h-0 lg:[&>section]:flex-1 lg:[&>section]:flex-col lg:[&>section]:overflow-y-auto lg:[&>section>div.relative]:h-auto lg:[&>section>div.relative]:min-h-[240px] lg:[&>section>div.relative]:flex-1">
          <div className="lg:hidden">{playback}</div>
          <ProgressionViewer frame={frame} active />
        </div>
        <PanelSplitter width={layout.panelWidth} panelsId="progression-panels" rowRef={rowRef} onResize={layout.setPanelWidth} />
        <div id="progression-panels" className="flex min-w-0 flex-col gap-6 lg:min-h-0 lg:w-[var(--panel-w)] lg:max-w-[calc(100%-416px)] lg:shrink-0 lg:gap-4 lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
          {panel("timeline", "Lesion progression playback", playback, "hidden lg:block")}
          {panel("stress", "Progression stress timeline", <StressChart activeMonth={frame.month} />)}
          {panel("values", "Illustrative demo values", <aside aria-label="Illustrative progression values" className="h-fit overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-5 py-4"><h2 className="text-[15px] font-semibold text-ink">Illustrative demo values</h2><p className="mt-0.5 text-[12px] text-muted">Synthetic placeholders · not measured</p></div>
            <Metric label="Peak von Mises" value={frame.peakVonMisesMPa} unit="MPa" icon={<Waves size={15} />} />
            <Metric label="Illustrative score" value={frame.fractureRiskPercent} unit="/ 100" icon={<ShieldAlert size={15} />} />
            <Metric label="Cortical thickness" value={frame.corticalThicknessMm} unit="mm" icon={<Ruler size={15} />} />
            <Metric label="Lesion volume" value={frame.lesionVolumeCm3} unit="cm³" icon={<Ruler size={15} />} />
            <p className="border-t border-line bg-sunken/60 px-5 py-3.5 text-[11.5px] leading-5 text-muted">These values are generated in the demo interface, not derived from the scans or solver. The score is not a fracture probability.</p>
          </aside>)}
          {/* A card only in the panel column; below lg it sits on the page as before. */}
          {panel("frames", "3D imaging frames", <div className="lg:rounded-2xl lg:border lg:border-line lg:bg-surface lg:p-4 lg:shadow-card"><h2 className="mb-3 text-sm font-semibold text-ink">3D imaging frames</h2><p className="mb-3 text-xs text-muted">All eight cached VTP previews are loaded below. The red marker shrinks with the illustrative interpolated lesion volume.</p><div className="grid gap-4 sm:grid-cols-2 lg:gap-3">{timeline.map(item => <ProgressionViewer key={item.vtpFile} frame={item} active />)}</div></div>)}
        </div>
      </div>}
    </div>
  );
}

function Metric({ label, value, unit, icon }: { label: string; value: number; unit: string; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4"><span className="flex items-center gap-2 text-[12.5px] text-body"><span className="text-muted">{icon}</span>{label}</span><span className="font-mono text-[17px] font-medium text-ink">{value}<small className="ml-1 text-[11px] font-normal text-muted">{unit}</small></span></div>;
}
