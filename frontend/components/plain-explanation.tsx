import { MessageSquareText } from "lucide-react";
import { openAskRainbone } from "@/lib/ask-rainbone";
import { FEMUR_INDEX_PERCENT } from "@/lib/model";
import { formatNumber } from "@/lib/format";
import { aiAnswerLabel } from "@/lib/ai-label";
import type { Explanation, ExplanationState } from "@/lib/api";
import { GroundingLine } from "@/components/grounding-line";
import { UsageLine } from "@/components/usage-line";

function sourceLabel(explanation: Explanation) {
  return aiAnswerLabel(explanation);
}

export function PlainExplanation({ state }: { state: ExplanationState }) {
  if (state.status === "idle" || state.status === "unavailable") return null;
  return (
    <section aria-labelledby="plain-words-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card" aria-live="polite" aria-busy={state.status === "loading"}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id="plain-words-title" className="text-[15px] font-semibold text-ink">In plain words</h2>
        <MessageSquareText size={17} className="text-link" aria-hidden />
      </div>
      <div className="px-5 py-4">
        {state.status === "loading" && <p className="text-[13px] leading-6 text-muted">Explaining the femur&apos;s results in plain words…</p>}
        {state.status === "error" && <p className="text-[13px] leading-6 text-caution">{state.message}</p>}
        {state.status === "ready" && <p className="text-[13.5px] leading-6 text-body">{state.explanation.text}</p>}
      </div>
      {state.status === "ready" && (
        <div className="space-y-1 border-t border-line bg-sunken/60 px-5 py-3 text-[11.5px] leading-5 text-muted">
          <p>{sourceLabel(state.explanation)} · every number in it was checked against the femur&apos;s solved values</p>
          <UsageLine answer={state.explanation} />
          <GroundingLine grounding={state.explanation.grounding} logged={state.explanation.logged} />
          <button type="button" className="rounded font-medium text-link underline-offset-4 hover:underline" onClick={() => openAskRainbone(`Why is ${formatNumber(FEMUR_INDEX_PERCENT, 2)}% not a fracture chance?`)}>Ask a follow-up</button>
        </div>
      )}
    </section>
  );
}
