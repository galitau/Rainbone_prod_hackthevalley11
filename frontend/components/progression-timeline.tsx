"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProgressionFrame } from "@/lib/progression-data";

export function ProgressionTimeline({ timeline, currentFrameIndex, onSelectFrame }: {
  timeline: ProgressionFrame[];
  currentFrameIndex: number;
  onSelectFrame: (index: number) => void;
}) {
  const frame = timeline[currentFrameIndex];

  if (!frame) return null;

  function select(index: number) {
    onSelectFrame(Math.max(0, Math.min(timeline.length - 1, index)));
  }

  return (
    <section aria-label="Lesion progression playback" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted">Lesion progression</p>
          <h2 className="mt-1 text-[15px] font-semibold text-ink">{frame.label} · month {frame.month}</h2>
          <p className="mt-1 text-xs text-muted">Frame {frame.frameIndex} of {timeline.length - 1} · {frame.vtpFile}</p>
        </div>
        <div className="flex items-center gap-2">
          <button aria-label="Previous progression frame" onClick={() => select(currentFrameIndex - 1)} disabled={currentFrameIndex === 0} className="rounded-lg border border-line p-2 text-muted disabled:opacity-30"><ChevronLeft size={16} /></button>
          <button aria-label="Next progression frame" onClick={() => select(currentFrameIndex + 1)} disabled={currentFrameIndex === timeline.length - 1} className="rounded-lg border border-line p-2 text-muted disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>
      <input aria-label="Progression frame" type="range" min={0} max={timeline.length - 1} step={1} value={currentFrameIndex} onChange={event => select(Number(event.target.value))} className="mt-5 w-full accent-primary" />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted"><span>MONTH 0</span><span>MONTH 12</span></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-body">Coordinates: <span className="font-mono text-ink">({frame.point.join(", ")})</span></p>
        <p className="text-[11px] text-muted">Manual scrub · loads selected frame only</p>
      </div>
    </section>
  );
}
