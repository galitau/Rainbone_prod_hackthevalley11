import type { HistoryRun } from "@/lib/api";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Peak stress of the runs GET /api/history returns (oldest first). Shown only when the API has saved runs.
export function RunHistory({ runs }: { runs: HistoryRun[] }) {
  const values = runs.map((run) => run.max_von_mises_stress_mpa);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const x = (index: number) => (runs.length === 1 ? 50 : 4 + (index / (runs.length - 1)) * 92);
  const y = (value: number) => (high === low ? 20 : 34 - ((value - low) / (high - low)) * 28);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const range = high === low ? `${high.toFixed(1)} MPa each` : `${low.toFixed(1)}–${high.toFixed(1)} MPa`;
  return (
    <div className="border-t border-line px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-caption font-medium text-ink">Saved runs</p>
        <p className="text-label text-muted">
          {runs.length === 1 ? "1 run" : `last ${runs.length} runs`} · peak stress
        </p>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-12 w-full" role="img" aria-label={`Peak stress of the last ${runs.length} saved runs: ${range}`}>
        <line x1="0" x2="100" y1="38" y2="38" className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {runs.length > 1 && <polyline points={points} fill="none" className="stroke-accent" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      </svg>
      <div className="mt-1 flex justify-between text-label tabular-nums text-muted">
        <span>{time(runs[0].time)}</span>
        <span>{range}</span>
        <span>{time(runs[runs.length - 1].time)}</span>
      </div>
    </div>
  );
}
