import { MessageSquareText } from "lucide-react";
import type { Explanation, ExplanationState } from "@/lib/api";

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", groq: "Groq" };

function sourceLabel({ provider, model }: Explanation) {
  if (provider === "template") return "Explained by the built-in template";
  return `Explained by ${PROVIDER_LABELS[provider] ?? provider}${model ? ` · ${model}` : ""}`;
}

export function PlainExplanation({ state }: { state: ExplanationState }) {
  if (state.status === "idle" || state.status === "unavailable") return null;
  return (
    <section className="rounded-xl border border-line bg-panel p-5" aria-live="polite" aria-busy={state.status === "loading"}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">In plain words</p>
        <MessageSquareText size={16} className="text-cyan" />
      </div>
      {state.status === "loading" && <p className="mt-3 text-xs leading-5 text-muted">Explaining these results in plain words…</p>}
      {state.status === "error" && <p className="mt-3 text-xs leading-5 text-warning">{state.message}</p>}
      {state.status === "ready" && (
        <>
          <p className="mt-3 text-[13px] leading-6 text-ink">{state.explanation.text}</p>
          <p className="mt-4 font-mono text-[10px] text-muted">{sourceLabel(state.explanation)}</p>
        </>
      )}
    </section>
  );
}
