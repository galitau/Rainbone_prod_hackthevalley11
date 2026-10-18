import { Gauge } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { ASSUMED_STRENGTH_MPA, FEMUR_INDEX_PERCENT, FEMUR_MODEL } from "@/lib/model";

// The headline: the fracture risk index of the femur in the viewer, from its own finite-element solve.
export function FractureRisk() {
  const percent = FEMUR_INDEX_PERCENT;
  return (
    <section aria-labelledby="fracture-risk-title" className="rounded-xl border border-warning/30 bg-panel p-6 shadow-glow">
      <div className="flex items-center justify-between gap-3">
        <h2 id="fracture-risk-title" className="flex items-center gap-2.5 text-lg font-medium tracking-tight text-ink">
          <Gauge size={22} className="text-warning" aria-hidden /> Fracture risk index
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}
        </span>
      </div>
      <p className="mt-5 font-mono text-[104px] font-semibold leading-none tracking-tighter text-warning">
        {Math.round(percent)}
        <span className="ml-1 text-4xl">%</span>
      </p>
      <div className="mt-6 h-3.5 overflow-hidden rounded-full bg-[#26333e]" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-cyan via-warning to-[#ef806b]" style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
      </div>
      <p className="mt-4 text-[13px] leading-6 text-muted">
        The most loaded spot of this femur ({formatNumber(FEMUR_MODEL.shownStressMpa, 1)} MPa) measured against an assumed bone strength of{" "}
        {ASSUMED_STRENGTH_MPA} MPa. A research index from one simulation, not a clinical probability.
      </p>
    </section>
  );
}
