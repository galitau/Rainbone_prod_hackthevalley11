import type { HistoryRun } from "@/lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;

// Stress of the saved runs of one input file that GET /api/history returns (oldest first).
// Shown only when the API has saved runs of that file.
export function RunHistory({ runs, name }: { runs: HistoryRun[]; name: string }) {
  const values = runs.map((run) => run.max_von_mises_stress_mpa);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const first = new Date(runs[0].time);
  const last = new Date(runs[runs.length - 1].time);
  const withDate = last.getTime() - first.getTime() >= DAY_MS || first.toDateString() !== last.toDateString();
  const when = (date: Date) =>
    withDate
      ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const x = (index: number) => (runs.length === 1 ? 50 : 4 + (index / (runs.length - 1)) * 92);
  // The axis starts at 0 MPa, so a change of a few hundredths does not look like a big swing.
  const y = (value: number) => (high > 0 ? 36 - (value / high) * 30 : 36);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const range = low.toFixed(1) === high.toFixed(1) ? `${high.toFixed(1)} MPa each` : `${low.toFixed(1)}–${high.toFixed(1)} MPa`;
  const count = runs.length === 1 ? "1 saved run" : `last ${runs.length} saved runs`;
  return (
    <div className="mt-4">
      <p className="text-caption text-ink">
        Saved runs of <span className="break-all font-mono">{name}</span>
      </p>
      <p className="text-label text-muted">{count} · stress, 99.5th percentile</p>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-2 h-12 w-full"
        role="img"
        aria-label={`Stress of the ${count} of ${name}: ${range}`}
      >
        <line x1="0" x2="100" y1="38" y2="38" className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {runs.length > 1 && (
          <polyline points={points} fill="none" className="stroke-accent" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        )}
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-label tabular-nums text-muted">
        <span>{when(first)}</span>
        <span>{range}</span>
        <span>{when(last)}</span>
      </div>
    </div>
  );
}
