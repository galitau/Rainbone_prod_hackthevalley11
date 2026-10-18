import { Gauge, Info, Ruler, Scale, Zap } from "lucide-react";
import type { ClinicalMetrics as Metrics } from "@/lib/mock-data";

type Status = "loading" | "ready" | "error";

const SOURCE: Record<Status, { label: string; className: string }> = {
  ready: { label: "From FEA service", className: "border-success/25 bg-success/[0.07] text-success" },
  error: { label: "Demo data", className: "border-caution/25 bg-caution/[0.08] text-caution" },
  loading: { label: "Loading", className: "border-line bg-sunken text-muted" },
};

// Risk is communicated with a word and a position, never by color alone.
function riskBand(percent: number) {
  if (percent < 30) return { label: "Low", className: "text-success" };
  if (percent < 60) return { label: "Moderate", className: "text-caution" };
  return { label: "High", className: "text-critical" };
}

export function ClinicalMetrics({ metrics, simulationStatus }: { metrics: Metrics; simulationStatus: Status }) {
  const source = SOURCE[simulationStatus];
  const band = riskBand(metrics.fractureRisk);
  const position = Math.min(100, Math.max(0, metrics.fractureRisk));
  const rows = [
    { label: "Max von Mises stress", value: metrics.maxStress, unit: "MPa", icon: <Zap size={15} /> },
    { label: "Average Young’s modulus", value: metrics.youngsModulus, unit: "GPa", icon: <Scale size={15} /> },
    { label: "Bone volume", value: metrics.boneVolume, unit: "cm³", icon: <Ruler size={15} /> },
  ];
  return (
    <aside aria-label="Clinical metrics" className="h-fit overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div><h2 className="text-[15px] font-semibold text-ink">Clinical metrics</h2><p className="mt-0.5 text-[12px] text-muted">Finite element analysis</p></div>
        <span aria-live="polite" className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${source.className}`}>{source.label}</span>
      </div>

      <section aria-label="Fracture risk index" className="px-5 pb-5 pt-5">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-body"><Gauge size={15} className="text-muted" aria-hidden /> Fracture risk index</p>
        <div className="mt-3 flex items-end justify-between">
          <p className="font-mono text-[40px] font-medium leading-none tracking-tight text-ink tabular-nums">{metrics.fractureRisk}<span className="ml-0.5 text-xl text-muted">%</span></p>
          <p className={`pb-1 text-[13px] font-semibold ${band.className}`}>{band.label} risk</p>
        </div>
        <div className="relative mt-4">
          <div className="spectrum-ramp h-2 rounded-full" />
          {[30, 60].map(threshold => <span key={threshold} className="absolute top-0 h-2 w-0.5 -translate-x-1/2 bg-surface" style={{ left: `${threshold}%` }} aria-hidden />)}
          <span className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface" style={{ left: `${position}%` }} aria-hidden />
        </div>
        <div className="relative mt-2 h-4 text-[11px] text-muted" aria-hidden>
          <span className="absolute left-0">Low</span>
          <span className="absolute -translate-x-1/2" style={{ left: "45%" }}>Moderate</span>
          <span className="absolute right-0">High</span>
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted">95% CI ± 4.2%</p>
      </section>

      <dl className="divide-y divide-line border-t border-line">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <dt className="flex items-center gap-2 text-[12.5px] text-body"><span className="text-muted" aria-hidden>{row.icon}</span>{row.label}</dt>
            <dd className="font-mono text-[17px] font-medium text-ink tabular-nums">{row.value}<span className="ml-1 text-[11px] font-normal text-muted">{row.unit}</span></dd>
          </div>
        ))}
      </dl>

      <p className="flex gap-2 border-t border-line bg-sunken/60 px-5 py-3.5 text-[11.5px] leading-5 text-muted"><Info size={14} className="mt-0.5 shrink-0" aria-hidden />Estimate combines stress concentration, density and patient-specific geometry. Not a diagnosis.</p>
    </aside>
  );
}
