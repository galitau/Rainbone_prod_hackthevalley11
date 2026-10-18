import { formatNumber } from "@/lib/format";

// The token footprint of one AI answer, as POST /api/explain and /api/risk-analysis send it (`usage`): the tokens the
// provider itself reported for the model call that wrote the answer (Gemini usageMetadata, Groq usage). output_tokens
// includes Gemini's thinking tokens. served says whether this response made that call (live) or reused the answer:
// cached (no model call) or saved (served after the live models failed or were skipped, so Gemini may have been called
// and its tokens are not counted here). Absent from older APIs; null for the template.
export type AiUsage = {
  prompt_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens?: number | null;
  total_tokens: number | null;
  provider: "gemini" | "groq";
  model: string;
  source: "live";
  served: "live" | "cached" | "saved";
};

export type UsageSource = {
  provider: string;
  served?: "live" | "cached" | "saved";
  usage?: AiUsage | null;
};

// Google's published per-prompt figure, not a measurement of this answer, so it is only ever shown as an estimate:
// "we estimate the median Gemini Apps text prompt uses 0.24 watt-hours (Wh) of energy, emits 0.03 grams of carbon
// dioxide equivalent (gCO2e), and consumes 0.26 milliliters (or about five drops) of water" (A. Vahdat, J. Dean, "How
// much energy does Google's AI use? We did the math", Google Cloud blog, 21 Aug 2025; method: Elsworth et al.,
// arXiv:2508.15734). It is a per-prompt median, so no per-token figure is derived from it.
export const GEMINI_PROMPT_FOOTPRINT = {
  wh: 0.24,
  gco2e: 0.03,
  label: "Google, May 2025",
  url: "https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference",
} as const;

// The tooltip under a counted answer, naming the model that wrote it.
export function usageWhy(provider: string): string {
  const writer = provider === "gemini" ? "Gemini" : "the AI model";
  return `Why we show this: code computes every number; ${writer} only writes the words, and the count is the provider's own usage report for the call that wrote this answer (a fallback can add calls).`;
}

export type UsageLine = { text: string; estimate: string | null; why: string | null };

const count = (value: number) => formatNumber(value, 0);

// One muted line under an AI answer: the tokens a live answer spent (with Google's per-prompt estimate for a Gemini
// one), "Reused" for an answer kept or saved earlier, and nothing for the template or when no usage was reported.
// Only a cached answer is sure to have made no model call: a saved one is served after the live models failed or were
// skipped, so its line does not claim that.
export function usageLine({ provider, served, usage }: UsageSource): UsageLine | null {
  if (provider !== "gemini" && provider !== "groq") return null;
  if (served === "cached") {
    return { text: `Reused — no new ${provider === "gemini" ? "Gemini" : "model"} call`, estimate: null, why: null };
  }
  if (served === "saved") {
    return { text: "Saved answer reused — its tokens were counted when it was written", estimate: null, why: null };
  }
  if (!usage || usage.total_tokens === null || usage.total_tokens === undefined) return null;
  const parts = [
    usage.prompt_tokens !== null && usage.prompt_tokens !== undefined && `${count(usage.prompt_tokens)} in`,
    usage.output_tokens !== null && usage.output_tokens !== undefined && `${count(usage.output_tokens)} out`,
  ].filter(Boolean);
  const text = `This answer: ${count(usage.total_tokens)} tokens${parts.length ? ` (${parts.join(" · ")})` : ""}`;
  const estimate = provider === "gemini"
    ? `for scale, not measured for this answer: a median Gemini Apps text prompt ≈ ${GEMINI_PROMPT_FOOTPRINT.wh} Wh, ${GEMINI_PROMPT_FOOTPRINT.gco2e} gCO2e`
    : null;
  return { text, estimate, why: usageWhy(provider) };
}
