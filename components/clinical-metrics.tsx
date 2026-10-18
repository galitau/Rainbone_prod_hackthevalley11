import { Gauge, Info, Ruler, Scale, Zap } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { ASSUMED_STRENGTH_MPA, FEMUR_INDEX_PERCENT, FEMUR_MODEL } from "@/lib/model";

// Display bands for the index (not clinical cut-offs). Risk is communicated with a word and a position, never by color alone.
function riskBand(percent: number) {
  if (percent < 30) return { label: "Low", className: "text-success" };
  if (percent < 60) return { label: "Moderate", className: "text-caution" };
  return { label: "High", className: "text-critical" };
}

// The femur in the viewer: its fracture risk index (the headline) and its own finite-element numbers,
// read from the model manifest of the same solve the viewer colours show.
export function ClinicalMetrics() {
  const m = FEMUR_MODEL;
  const percent = FEMUR_INDEX_PERCENT;
  const band = riskBand(percent);
  const position = Math.min(100, Math.max(0, percent));
  const rows = [
    { label: "Max von Mises stress", value: formatNumber(m.shownStressMpa, 1), unit: "MPa", icon: <Zap size={15} /> },
    { label: "Young’s modulus (assumed)", value: formatNumber(m.youngsModulusGpa, 1), unit: "GPa", icon: <Scale size={15} /> },
    { label: "Bone volume", value: formatNumber(m.volumeCm3, 1), unit: "cm³", icon: <Ruler size={15} /> },
  ];
  return (
    <aside aria-label="Clinical metrics" className="h-fit overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div><h2 className="text-[15px] font-semibold text-ink">Clinical metrics</h2><p className="mt-0.5 text-[12px] text-muted">Finite element analysis · {m.solver}</p></div>
        <span className="shrink-0 rounded-full border border-success/25 bg-success/[0.07] px-2.5 py-1 text-[11px] font-medium text-success">{m.dataset} {m.caseId}</span>
      </div>

      <section aria-label="Fracture risk index" className="px-5 pb-6 pt-5">
        <p className="flex items-center gap-2 text-[17px] font-semibold text-ink"><Gauge size={20} className="text-muted" aria-hidden /> Fracture risk index</p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <p className="font-mono text-[96px] font-semibold leading-[0.85] tracking-tighter text-ink tabular-nums">{Math.round(percent)}<span className="ml-1 text-[40px] text-muted">%</span></p>
          <p className={`pb-1 text-[19px] font-semibold ${band.className}`}>{band.label} risk</p>
        </div>
        <div className="relative mt-6">
          <div className="spectrum-ramp h-3.5 rounded-full" />
          {[30, 60].map(threshold => <span key={threshold} className="absolute top-0 h-3.5 w-0.5 -translate-x-1/2 bg-surface" style={{ left: `${threshold}%` }} aria-hidden />)}
          <span className="absolute -top-1.5 h-[26px] w-1.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface" style={{ left: `${position}%` }} aria-hidden />
        </div>
        <div className="relative mt-2.5 h-4 text-[11px] text-muted" aria-hidden>
          <span className="absolute left-0">Low</span>
          <span className="absolute -translate-x-1/2" style={{ left: "45%" }}>Moderate</span>
          <span className="absolute right-0">High</span>
        </div>
      </section>

      <dl className="divide-y divide-line border-t border-line">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <dt className="flex items-center gap-2 text-[12.5px] text-body"><span className="text-muted" aria-hidden>{row.icon}</span>{row.label}</dt>
            <dd className="font-mono text-[17px] font-medium text-ink tabular-nums">{row.value}<span className="ml-1 text-[11px] font-normal text-muted">{row.unit}</span></dd>
          </div>
        ))}
      </dl>

      <p className="flex gap-2 border-t border-line bg-sunken/60 px-5 py-3.5 text-[11.5px] leading-5 text-muted"><Info size={14} className="mt-0.5 shrink-0" aria-hidden />The most loaded spot of this femur ({formatNumber(m.shownStressMpa, 1)} MPa) against an assumed bone strength of {ASSUMED_STRENGTH_MPA} MPa. Bands at 30% and 60% are display thresholds. Research index, not a diagnosis.</p>
    </aside>
  );
}
