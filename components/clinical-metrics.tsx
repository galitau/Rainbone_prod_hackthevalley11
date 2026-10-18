import { Ruler, Scale, Zap } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { FEMUR_MODEL } from "@/lib/model";

// The femur's own finite-element numbers, read from its model manifest (the same solve the viewer colours show).
export function ClinicalMetrics() {
  const m = FEMUR_MODEL;
  const cards = [
    { label: "Max Von Mises stress", value: formatNumber(m.shownStressMpa, 1), unit: "MPa", icon: <Zap size={16} />, tone: "text-warning" },
    { label: "Young’s modulus (assumed)", value: formatNumber(m.youngsModulusGpa, 1), unit: "GPa", icon: <Scale size={16} />, tone: "text-violet" },
    { label: "Bone volume", value: formatNumber(m.volumeCm3, 1), unit: "cm³", icon: <Ruler size={16} />, tone: "text-cyan" },
  ];
  return <section className="rounded-xl border border-line bg-panel p-5 shadow-glow"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Clinical metrics</p><p className="mt-1 text-xs text-muted">Finite element analysis · {m.solver}</p></div><span className="font-mono text-[9px] uppercase tracking-wider text-cyan">{m.dataset} {m.caseId}</span></div><div className="mt-6 space-y-3">{cards.map((card) => <div className="rounded-lg border border-line/80 bg-[#101a24] p-3.5" key={card.label}><div className="flex items-center justify-between"><span className={`flex items-center gap-2 text-xs ${card.tone}`}>{card.icon}{card.label}</span><span className="font-mono text-[10px] text-muted">FEA</span></div><p className="mt-3 font-mono text-2xl tracking-tight text-ink">{card.value}<span className="ml-1 text-xs text-muted">{card.unit}</span></p></div>)}</div></section>;
}
