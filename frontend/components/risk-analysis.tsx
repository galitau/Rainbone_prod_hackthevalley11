import { ArrowDownToLine, Gauge, Info, Shield, Sparkles } from "lucide-react";
import type { RiskAnalysis, RiskAnalysisState, RiskFacts } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { ASSUMED_STRENGTH_MPA, FEMUR_AUTHORS, FEMUR_INDEX_PERCENT, FEMUR_MODEL } from "@/lib/model";

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", groq: "Groq" };
// van den Kroonenberg et al. 1995: peak trochanter impact force of a sideways fall, 5th to 95th percentile woman.
const FALL_FORCE_SOURCE = "https://pubmed.ncbi.nlm.nih.gov/8618384/";

function providerLabel({ provider, model }: RiskAnalysis) {
  if (provider === "template") return "Written by the built-in template";
  return `Analysed by ${PROVIDER_LABELS[provider] ?? provider}${model ? ` · ${model}` : ""}`;
}

// A doi.org link whether the API sends "10.6092/…", "DOI:10.6092/…" or a doi.org URL.
function doiUrl(doi: string | undefined) {
  const bare = (doi ?? "").trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "");
  return bare ? `https://doi.org/${bare}` : FEMUR_MODEL.sourceUrl;
}

const range = (low: number, high: number, digits: number) => `${formatNumber(low, digits)}–${formatNumber(high, digits)}`;

// Above 1× a sideways fall exceeds the femur's strength. In HFValid that is true of every femur (the strongest MSF is
// below the smaller fall force), so the note says so and points at the ranks instead of reading 1× as a verdict.
function fallNote(f: RiskFacts) {
  const forces = `A sideways fall hits the hip with ${range(f.fall_force_low_newtons, f.fall_force_high_newtons, 0)}\u00a0N`;
  if (f.fall_force_low_newtons > f.cohort_msf_max_newtons) {
    return `${forces}. Every femur in the study is above 1× (the strongest MSF is ${formatNumber(f.cohort_msf_max_newtons, 0)}\u00a0N), so the ranks above are what set this one apart`;
  }
  return `${forces}; above 1× that exceeds its strength`;
}

function outcome(f: RiskFacts) {
  if (!f.fractured_within_followup) return "no fracture during follow-up";
  return f.days_ct_to_fracture === null ? "fractured during follow-up" : `fractured ${formatNumber(f.days_ct_to_fracture, 0)} days after the CT`;
}

// What the HFValid authors published for the femur on screen (ARF0, MSF), set against sideways-fall impact forces,
// with an AI reading of those numbers. Every number comes from POST /api/risk-analysis, which reads the dataset's
// own metadata; the API checks each number in the AI text against it.
export function FractureRiskAnalysis({ state }: { state: RiskAnalysisState }) {
  if (state.status === "idle" || state.status === "unavailable") return null;
  const analysis = state.status === "ready" ? state.analysis : null;
  const f = analysis?.facts;
  return (
    <section aria-labelledby="risk-analysis-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card" aria-live="polite" aria-busy={state.status === "loading"}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="risk-analysis-title" className="text-[15px] font-semibold text-ink">AI fracture risk analysis</h2>
          <p className="mt-0.5 text-[12px] text-muted">{FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}{f ? ` · age ${f.age} at CT · ${outcome(f)}` : " · published sideways-fall data"}</p>
        </div>
        <Sparkles size={17} className="mt-0.5 shrink-0 text-link" aria-hidden />
      </div>

      {state.status === "loading" && <p className="px-5 py-4 text-[13px] leading-6 text-muted">Analysing this femur&apos;s published fracture risk…</p>}
      {state.status === "error" && <p className="px-5 py-4 text-[13px] leading-6 text-caution">{state.message}</p>}

      {analysis && f && (
        <>
          <p className="flex gap-2 border-b border-line px-5 py-3 text-[12px] leading-5 text-body">
            <Info size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span>
              Two different measures. The {Math.round(FEMUR_INDEX_PERCENT)}% above is our own stress index: peak stress under {formatNumber(FEMUR_MODEL.loadNewtons, 0)}&nbsp;N
              on the femoral head against an assumed {ASSUMED_STRENGTH_MPA}&nbsp;MPa strength, not a fall and not a likelihood of breaking. Below are the HFValid
              authors&apos; fall-based results from their finite-element model.
            </span>
          </p>

          <dl className="divide-y divide-line">
            <Fact
              icon={<Gauge size={15} />}
              label="Published fracture risk · ARF0"
              value={formatNumber(f.arf0_percent, 1)}
              unit="%"
              note={`Higher than ${f.arf0_higher_than} of the ${f.cohort_n} women in the study${f.fractured_arf0_min_percent !== null && f.fractured_arf0_max_percent !== null ? `; the ${f.cohort_fractured} who fractured during follow-up had ${range(f.fractured_arf0_min_percent, f.fractured_arf0_max_percent, 1)}%` : ""}`}
            />
            <Fact
              icon={<Shield size={15} />}
              label="Sideways-fall strength · MSF"
              value={formatNumber(f.msf_newtons, 0)}
              unit="N"
              note={`The sideways-fall load that would break it in the authors' model; weaker than ${f.msf_lower_than} of the ${f.cohort_n}`}
            />
            <Fact
              icon={<ArrowDownToLine size={15} />}
              label="Fall load vs strength"
              value={range(f.factor_of_risk_low, f.factor_of_risk_high, 2)}
              unit="×"
              note={fallNote(f)}
            />
          </dl>

          <p className="border-t border-line px-5 py-4 text-[13.5px] leading-6 text-body">{analysis.text}</p>

          <div className="space-y-1 border-t border-line bg-sunken/60 px-5 py-3 text-[11.5px] leading-5 text-muted">
            <p>{providerLabel(analysis)} · every number checked against the published data</p>
            <p>
              ARF0 (absolute risk of fracture at time 0) and MSF (minimum sidefall strength) are the HFValid authors&apos; finite-element results,{" "}
              <a href={doiUrl(analysis.source?.doi)} target="_blank" rel="noreferrer" title={analysis.source?.citation} className="font-medium text-link hover:underline">{FEMUR_AUTHORS}</a>
              , {analysis.source?.license || FEMUR_MODEL.license}. Fall forces:{" "}
              <a href={FALL_FORCE_SOURCE} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">van den Kroonenberg et al. 1995</a>.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Fact({ icon, label, value, unit, note }: { icon: React.ReactNode; label: string; value: string; unit: string; note: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-3.5">
      <dt className="flex items-center gap-2 text-[12.5px] text-body"><span className="text-muted" aria-hidden>{icon}</span>{label}</dt>
      <dd className="font-mono text-[17px] font-medium text-ink tabular-nums">{value}<span className="ml-1 text-[11px] font-normal text-muted">{unit}</span></dd>
      <dd className="col-span-2 mt-1 text-[11.5px] leading-5 text-muted">{note}</dd>
    </div>
  );
}
