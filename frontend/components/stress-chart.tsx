import type { HistoryHour, HistoryRun } from "@/lib/api";

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "Time unavailable";
}

// The caller selects an input filename. Repeated executions are not patient follow-up scans.
export function StressChart({ runs, name, hourly }: { runs: HistoryRun[]; name: string; hourly?: HistoryHour[] }) {
  if (runs.length === 0) return null;
  const values = runs.map((run) => run.max_von_mises_stress_mpa);
  const max = Math.max(...values);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${100 - (max > 0 ? (value / max) * 78 : 0) - 8}`).join(" ");
  const ticks = [1, 2 / 3, 1 / 3, 0].map((share) => ({ label: (max * share).toFixed(1), top: 100 - share * 78 - 8 }));
  const recent = runs.slice(-5).reverse();
  const latestHour = hourly?.reduce<HistoryHour | undefined>((latest, hour) =>
    !latest || Date.parse(hour.bucket) > Date.parse(latest.bucket) ? hour : latest, undefined);
  return (
    <section aria-label="Saved simulation runs" className="rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Saved simulation runs</h2>
          <p className="mt-1 text-[12px] text-muted">{runs.length} returned runs for <span className="break-all font-mono">{name}</span></p>
          <p className="mt-2 text-[12px] leading-5 text-body">Simulation execution history, not patient progression. Matching filenames do not confirm identical scans or settings.</p>
        </div>
        <p className="shrink-0 text-right"><span className="font-mono text-[22px] font-medium text-ink tabular-nums">{values[values.length - 1].toFixed(1)}</span><span className="ml-1 text-[11px] text-muted">MPa · latest returned</span></p>
      </div>
      {runs.length > 1 ? <>
        <div className="relative mt-5 h-32">
          <div className="absolute inset-0">
            {ticks.map((tick, index) => <div key={index} className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2" style={{ top: `${tick.top}%` }}><span className="w-8 text-right font-mono text-[10px] text-muted">{tick.label}</span><span className="h-px flex-1 bg-line" /></div>)}
          </div>
          <svg className="absolute inset-y-0 left-10 h-full w-[calc(100%-2.5rem)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Peak von Mises stress in MPa by returned run order, oldest to newest; maximum ${max.toFixed(1)} MPa. Exact recent values are in the table below.`}>
            <polyline fill="none" points={points} stroke="rgb(37 70 184)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="ml-10 mt-2 flex justify-between gap-2 text-[10px] text-muted"><span>Oldest returned</span><span>Run order · equal spacing</span><span>Newest returned</span></div>
      </> : <p className="mt-4 text-[12px] text-muted">One saved run returned. Another execution will allow a run-order comparison.</p>}
      <div className="mt-5 overflow-x-auto rounded-lg border border-line" role="region" aria-label="Recent saved run evidence" tabIndex={0}>
        <table className="w-full text-left text-[11px]">
          <caption className="border-b border-line bg-sunken/60 px-3 py-2 text-left font-medium text-ink">Latest {recent.length} returned {recent.length === 1 ? "run" : "runs"} · newest first</caption>
          <thead className="bg-sunken/40 text-muted"><tr><th scope="col" className="px-3 py-2 font-medium">Saved time / run ID</th><th scope="col" className="px-3 py-2 text-right font-medium">Load (N)</th><th scope="col" className="px-3 py-2 text-right font-medium">Peak stress (MPa)</th><th scope="col" className="px-3 py-2 text-right font-medium">Solver call (s)</th></tr></thead>
          <tbody className="divide-y divide-line">
            {recent.map((run, index) => <tr key={run.run_id ?? `${run.time}-${index}`}>
              <th scope="row" className="px-3 py-3 font-normal">
                <time dateTime={run.time} className="whitespace-nowrap font-mono text-ink">{timestamp(run.time)}</time>
                <details className="mt-1 text-muted"><summary className="cursor-pointer text-link">Run evidence</summary><dl className="mt-2 space-y-1"><div><dt className="font-medium">Run ID</dt><dd className="break-all font-mono">{run.run_id ?? "Not recorded"}</dd></div><div><dt className="font-medium">Input</dt><dd className="break-all font-mono">{run.source_filename}</dd></div><div><dt className="font-medium">Solver</dt><dd className="break-all font-mono">{run.solver ?? "Not recorded"}</dd></div></dl></details>
              </th>
              <td className="px-3 py-3 text-right align-top font-mono tabular-nums">{run.load_newtons?.toFixed(0) ?? "Not recorded"}</td>
              <td className="px-3 py-3 text-right align-top font-mono tabular-nums">{run.max_von_mises_stress_mpa.toFixed(2)}</td>
              <td className="px-3 py-3 text-right align-top font-mono tabular-nums">{run.solve_ms != null ? (run.solve_ms / 1000).toFixed(2) : "Not recorded"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {latestHour ? <p className="mt-3 rounded-lg border border-line bg-sunken/60 px-3 py-2 text-[11px] leading-5 text-body"><span className="font-medium">All-input engine activity:</span> {latestHour.runs} saved {latestHour.runs === 1 ? "execution" : "executions"} in the hour starting {timestamp(latestHour.bucket)}. Hourly count from the history API; not a patient measure.</p> : null}
      <p className="mt-3 text-[11px] leading-5 text-muted">Read back from saved history. This list does not confirm that an in-progress run has been saved.</p>
    </section>
  );
}
