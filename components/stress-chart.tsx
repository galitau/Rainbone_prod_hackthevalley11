import { mockStressSeries } from "@/lib/mock-data";

const TICKS = [140, 100, 60, 20];

export function StressChart({ activeMonth }: { activeMonth?: number }) {
  const max = Math.max(...mockStressSeries.map((point) => point.value));
  const points = mockStressSeries.map((point, index) => `${(index / (mockStressSeries.length - 1)) * 100},${100 - (point.value / max) * 78 - 8}`).join(" ");
  const last = mockStressSeries[mockStressSeries.length - 1];
  return (
    <section aria-label="Peak stress history" className="rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Peak stress over simulation history</h2>
          <p className="mt-0.5 text-[12px] text-muted">Longitudinal tracking · von Mises, MPa · demo series</p>
        </div>
        <p className="text-right"><span className="font-mono text-[22px] font-medium text-ink tabular-nums">{last.value}</span><span className="ml-1 text-[11px] text-muted">MPa · {last.label}</span></p>
      </div>
      <div className="relative mt-5 h-40">
        <div className="absolute inset-0 flex flex-col justify-between">
          {TICKS.map(tick => <div key={tick} className="flex items-center gap-2"><span className="w-6 text-right font-mono text-[10px] text-muted">{tick}</span><span className="h-px flex-1 bg-line" /></div>)}
        </div>
        <svg className="absolute inset-y-0 left-8 right-0 h-full w-[calc(100%-2rem)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgb(37 70 184)" stopOpacity=".14" /><stop offset="100%" stopColor="rgb(37 70 184)" stopOpacity="0" /></linearGradient></defs>
          <polyline fill="url(#chart-fill)" points={`0,100 ${points} 100,100`} stroke="none" />
          <polyline fill="none" points={points} stroke="rgb(37 70 184)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {activeMonth !== undefined && <line x1={(activeMonth / 12) * 100} x2={(activeMonth / 12) * 100} y1="0" y2="100" stroke="#9a5a00" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
      <div className="ml-8 mt-2 flex justify-between font-mono text-[10px] text-muted"><span>JAN 26</span><span>APR 26</span><span>JUL 26</span><span>OCT 26</span></div>
    </section>
  );
}
