import { formatNumber } from "@/lib/format";

// The token footprint of one AI answer, as POST /api/explain and /api/risk-analysis send it (`usage`): the tokens the
// provider itself reported for the model call that wrote the answer (Gemini usageMetadata, Groq usage). output_tokens
// includes Gemini's thinking tokens. served/new_tokens say whether this response made that call (live) or reused the
// answer (cached, saved: no new call, 0 new tokens). Absent from older APIs; null for the template.
export type AiUsage = {
  prompt_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens?: number | null;
  total_tokens: number | null;
  provider: "gemini" | "groq";
  model: string;
  source: "live";
  served: "live" | "cached" | "saved";
  new_tokens: number | null;
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
  label: "Google 2025 median Gemini Apps text prompt",
  url: "https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference",
} as const;

export const USAGE_WHY = "Why we show this: code computes every number; Gemini only writes the words, so each answer is one short model call, and the count is the provider's own usage report.";

export type UsageLine = { text: string; estimate: string | null };

const count = (value: number) => formatNumber(value, 0);

// One muted line under an AI answer: the tokens a live answer spent (with Google's per-prompt estimate for a Gemini
// one), "Reused" for an answer kept or saved earlier, and nothing for the template or when no usage was reported.
export function usageLine({ provider, served, usage }: UsageSource): UsageLine | null {
  if (provider !== "gemini" && provider !== "groq") return null;
  if (served === "cached" || served === "saved") {
    return { text: `Reused — no new ${provider === "gemini" ? "Gemini" : "model"} call`, estimate: null };
  }
  if (!usage || usage.total_tokens === null || usage.total_tokens === undefined) return null;
  const parts = [
    usage.prompt_tokens !== null && usage.prompt_tokens !== undefined && `${count(usage.prompt_tokens)} in`,
    usage.output_tokens !== null && usage.output_tokens !== undefined && `${count(usage.output_tokens)} out`,
  ].filter(Boolean);
  const text = `This answer: ${count(usage.total_tokens)} tokens${parts.length ? ` (${parts.join(" · ")})` : ""}`;
  const estimate = provider === "gemini"
    ? `est. ≈ ${GEMINI_PROMPT_FOOTPRINT.wh} Wh, ${GEMINI_PROMPT_FOOTPRINT.gco2e} gCO2e`
    : null;
  return { text, estimate };
}
