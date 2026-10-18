import type { HistoryRun } from "@/lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;

// Peak stress of the saved runs of one input file that GET /api/history returns (oldest first).
// Shown only when the API has at least two saved runs of that file.
export function StressChart({ runs, name }: { runs: HistoryRun[]; name: string }) {
  const values = runs.map((run) => run.max_von_mises_stress_mpa);
  const max = Math.max(...values);
  const first = new Date(runs[0].time);
  const last = new Date(runs[runs.length - 1].time);
  const withDate = last.getTime() - first.getTime() >= DAY_MS || first.toDateString() !== last.toDateString();
  const when = (date: Date) =>
    withDate
      ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // The axis starts at 0 MPa, so a change of a few hundredths does not look like a big swing.
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${100 - (max > 0 ? (value / max) * 78 : 0) - 8}`).join(" ");
  // Labels sit at the same heights as the plotted points (value v at 100 - v/max*78 - 8 % from the top).
  const ticks = [1, 2 / 3, 1 / 3, 0].map((share) => ({ label: (max * share).toFixed(1), top: 100 - share * 78 - 8 }));
  return (
    <section aria-label="Peak stress history" className="rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Peak stress over simulation history</h2>
          <p className="mt-0.5 text-[12px] text-muted">Last {runs.length} saved runs of <span className="break-all font-mono">{name}</span> · von Mises, MPa</p>
        </div>
        <p className="text-right"><span className="font-mono text-[22px] font-medium text-ink tabular-nums">{values[values.length - 1].toFixed(1)}</span><span className="ml-1 text-[11px] text-muted">MPa · latest</span></p>
      </div>
      <div className="relative mt-5 h-40">
        <div className="absolute inset-0">
          {ticks.map((tick, index) => <div key={index} className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2" style={{ top: `${tick.top}%` }}><span className="w-6 text-right font-mono text-[10px] text-muted">{tick.label}</span><span className="h-px flex-1 bg-line" /></div>)}
        </div>
        <svg className="absolute inset-y-0 left-8 right-0 h-full w-[calc(100%-2rem)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Peak stress of the last ${runs.length} saved runs, up to ${max.toFixed(1)} MPa`}>
          <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgb(37 70 184)" stopOpacity=".14" /><stop offset="100%" stopColor="rgb(37 70 184)" stopOpacity="0" /></linearGradient></defs>
          <polyline fill="url(#chart-fill)" points={`0,100 ${points} 100,100`} stroke="none" />
          <polyline fill="none" points={points} stroke="rgb(37 70 184)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="ml-8 mt-2 flex justify-between font-mono text-[10px] text-muted"><span>{when(first)}</span><span>{when(last)}</span></div>
    </section>
  );
}
