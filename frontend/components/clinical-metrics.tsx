import { ArrowDownToLine, Gauge, Info, Percent, Ruler, Scale, Users, Zap } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { ASSUMED_STRENGTH_MPA, FEMUR_AUTHORS, FEMUR_FALL_RISK, FEMUR_INDEX_PERCENT, FEMUR_MODEL } from "@/lib/model";

// van den Kroonenberg et al. 1995: peak trochanter impact force of a sideways fall, 5th to 95th percentile woman.
const FALL_FORCE_SOURCE = "https://pubmed.ncbi.nlm.nih.gov/8618384/";

const percent = (value: number) => `${formatNumber(value, 1)} %`;

// The femur in the viewer: its published fall-based fracture risk (the headline, HFValid ARF0 placed among the study's
// women) and its own finite-element numbers, read from the model manifest of the same solve the viewer colours show.
export function ClinicalMetrics() {
  const m = FEMUR_MODEL;
  const r = FEMUR_FALL_RISK;
  // Positions on a ramp that runs from the study's lowest to its highest ARF0.
  const at = (value: number) => ((value - r.cohortArf0Min) / (r.cohortArf0Max - r.cohortArf0Min)) * 100;
  const mine = at(r.arf0Percent);
  const median = at(r.cohortArf0Median);
  const fracturedLow = at(r.fracturedArf0Min);
  const fracturedHigh = at(r.fracturedArf0Max);
  const fracturedRange = `${formatNumber(r.fracturedArf0Min, 1)}–${percent(r.fracturedArf0Max)}`;
  const rampLabel = `This femur's ARF0 is ${percent(r.arf0Percent)} on the study's range from ${percent(r.cohortArf0Min)} to ${percent(r.cohortArf0Max)}. Study median ${percent(r.cohortArf0Median)}. The ${r.cohortFractured} women who fractured during follow-up had ${fracturedRange}.`;
  const rows = [
    { label: `Standing-load stress ratio (${formatNumber(m.shownStressMpa, 1)} ÷ assumed ${ASSUMED_STRENGTH_MPA} MPa)`, value: formatNumber(FEMUR_INDEX_PERCENT, 1), unit: "%", icon: <Percent size={15} /> },
    { label: "Peak stress (nodal average)", value: formatNumber(m.shownStressMpa, 1), unit: "MPa", icon: <Zap size={15} /> },
    { label: "Young’s modulus (assumed)", value: formatNumber(m.youngsModulusGpa, 1), unit: "GPa", icon: <Scale size={15} /> },
    { label: "Bone volume", value: formatNumber(m.volumeCm3, 1), unit: "cm³", icon: <Ruler size={15} /> },
  ];
  return (
    <aside aria-label="Clinical metrics" className="h-fit overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div><h2 className="text-[15px] font-semibold text-ink">Clinical metrics</h2><p className="mt-0.5 text-[12px] text-muted">Published fall model · {m.solver} solve</p></div>
        <span className="shrink-0 rounded-full border border-success/25 bg-success/[0.07] px-2.5 py-1 text-[11px] font-medium text-success">{m.dataset} {m.caseId}</span>
      </div>

      <section aria-label="Fracture risk, published HFValid model" className="px-5 pb-6 pt-5">
        <p className="flex items-start gap-2 text-ink">
          <Gauge size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span className="flex flex-col">
            <span className="text-[19px] font-semibold leading-6">Fracture risk</span>
            <span className="text-[13.5px] font-medium leading-5 text-body"><span className="sr-only"> · </span>published {m.dataset} model (ARF0)</span>
          </span>
        </p>
        <p className="mt-1.5 pl-7 text-[12px] leading-5 text-muted">Absolute risk of fracture at time&nbsp;0 (ARF0) that the study authors&apos; finite-element and falling model gives this femur</p>

        <div className="mt-4 flex items-end justify-between gap-3">
          <p className="font-mono text-[96px] font-semibold leading-[0.85] tracking-tighter text-ink tabular-nums">{Math.round(r.arf0Percent)}<span className="ml-1 text-[40px] text-muted">%</span></p>
          <div className="pb-1 text-right">
            <p className="font-mono text-[19px] font-semibold text-ink tabular-nums">{percent(r.arf0Percent)}</p>
            <p className="text-[12px] text-muted">ARF0 as published</p>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-body">
          The study authors&apos; model estimate, not a personal probability: {r.cohortFractured} of the {r.cohortN} women fractured during the study&apos;s
          follow-up, while the median ARF0 was {percent(r.cohortArf0Median)}.
        </p>

        <div role="img" aria-label={rampLabel} className="mt-6">
          <div className="relative h-[26px] text-[11px] font-medium text-critical">
            <span className="absolute top-0 whitespace-nowrap" style={{ right: `${100 - fracturedHigh}%` }}>{r.cohortFractured} who fractured · {fracturedRange}</span>
            <span className="absolute bottom-0 h-1.5 rounded-t-sm border-x-2 border-t-2 border-critical/70" style={{ left: `${fracturedLow}%`, width: `${fracturedHigh - fracturedLow}%` }} />
          </div>
          <div className="relative mt-1">
            <div className="h-3.5 rounded-full bg-gradient-to-r from-critical/[0.06] to-critical/50" />
            <span
              className="absolute top-0 h-3.5"
              style={{ left: `${fracturedLow}%`, width: `${fracturedHigh - fracturedLow}%`, backgroundImage: "repeating-linear-gradient(135deg, rgb(var(--critical) / 0.55) 0 2px, transparent 2px 5px)" }}
              title={`The ${r.cohortFractured} women who fractured during follow-up: ARF0 ${fracturedRange}`}
            />
            <span className="absolute -top-1 h-[22px] w-0.5 -translate-x-1/2 bg-ink/70" style={{ left: `${median}%` }} title={`Study median ARF0 ${percent(r.cohortArf0Median)}`} />
            <span className="absolute -top-1.5 h-[26px] w-1.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface" style={{ left: `${mine}%` }} title={`This femur: ARF0 ${percent(r.arf0Percent)}`} />
          </div>
          <div className="relative mt-2 h-4 text-[11px] text-muted">
            <span className="absolute left-0">{percent(r.cohortArf0Min)}</span>
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${median}%` }}>median {percent(r.cohortArf0Median)}</span>
            <span className="absolute right-0">{percent(r.cohortArf0Max)}</span>
          </div>
        </div>

        <ul className="mt-5 space-y-2.5 text-[15px] font-semibold leading-snug text-ink">
          <li className="flex gap-2"><Users size={17} className="mt-0.5 shrink-0 text-muted" aria-hidden />Higher than {r.arf0HigherThan} of the {r.cohortN} women in the study</li>
          <li className="flex gap-2"><ArrowDownToLine size={17} className="mt-0.5 shrink-0 text-muted" aria-hidden />A sideways fall would load this femur {formatNumber(r.factorOfRiskLow, 1)}–{formatNumber(r.factorOfRiskHigh, 1)}× its strength</li>
        </ul>
      </section>

      <dl className="divide-y divide-line border-t border-line">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <dt className="flex items-center gap-2 text-[12.5px] text-body"><span className="text-muted" aria-hidden>{row.icon}</span>{row.label}</dt>
            <dd className="shrink-0 font-mono text-[17px] font-medium text-ink tabular-nums">{row.value}<span className="ml-1 text-[11px] font-normal text-muted">{row.unit}</span></dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-2 border-t border-line bg-sunken/60 px-5 py-3.5 text-[11.5px] leading-5 text-muted">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        <div className="space-y-1.5">
          <p>
            ARF0, in the dataset README&apos;s words: &ldquo;{r.arf0Definition}&rdquo;{" "}
            <a href={r.doiUrl} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">{FEMUR_AUTHORS}</a>, {m.dataset}, {r.license}.
            The strength a fall is set against is the femur&apos;s minimum sidefall strength (MSF) from the same model; fall forces from{" "}
            <a href={FALL_FORCE_SOURCE} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">van den Kroonenberg et al. 1995</a>.
          </p>
          <p>The stress ratio is this femur&apos;s highest nodal-averaged stress under {formatNumber(m.loadNewtons, 0)}&nbsp;N standing load ({formatNumber(m.shownStressMpa, 1)} MPa, the top of the colour scale; single-element peak {formatNumber(m.elementStressMpa, 1)} MPa) against an assumed bone strength of {ASSUMED_STRENGTH_MPA} MPa. Research data, not a diagnosis.</p>
        </div>
      </div>
    </aside>
  );
}
