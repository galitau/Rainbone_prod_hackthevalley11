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
  const ticks = [1, 2 / 3, 1 / 3, 0].map((share) => (max * share).toFixed(1));
  return <section className="rounded-xl border border-line bg-panel p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Longitudinal tracking</p><h3 className="mt-1 text-sm font-medium text-ink">Peak stress of the last {runs.length} saved runs of <span className="break-all font-mono">{name}</span></h3></div><div className="flex items-center gap-2 text-[10px] text-muted"><span className="h-2 w-2 rounded-full bg-cyan" /> Von Mises stress <span className="ml-3 font-mono">MPa</span></div></div><div className="relative mt-5 h-36"><div className="absolute inset-0 flex flex-col justify-between border-b border-l border-line/70">{ticks.map((tick, index) => <span key={index} className="border-t border-line/50 font-mono text-[9px] text-muted">{tick}</span>)}</div><svg className="absolute inset-0 h-full w-full overflow-visible pl-8" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Peak stress of the last ${runs.length} saved runs, up to ${max.toFixed(1)} MPa`}><polyline fill="none" points={points} stroke="#4fdbd1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /><polyline fill="url(#chart-fill)" points={`0,100 ${points} 100,100`} stroke="none" /><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4fdbd1" stopOpacity=".18" /><stop offset="100%" stopColor="#4fdbd1" stopOpacity="0" /></linearGradient></defs></svg></div><div className="ml-8 mt-2 flex justify-between font-mono text-[9px] text-muted"><span>{when(first)}</span><span>{when(last)}</span></div></section>;
}
