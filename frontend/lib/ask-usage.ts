import type { AiUsage } from "@/lib/ai-usage";

export type TokenCounts = {
  prompt_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens?: number | null;
  total_tokens: number | null;
};
export type WorkflowUsage = {
  scope: "current_request";
  reuse: "none" | "cache" | "in_flight";
  calls: Array<{ stage: "triage" | "writer"; provider: "gemini" | "groq"; model: string; usage: TokenCounts | null }>;
  reported_totals: TokenCounts;
  complete: boolean;
  incomplete_reasons: Array<"missing_usage" | "failed_attempt" | "request_timeout" | "invalid_provider_output">;
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
function parseCounts(value: unknown): TokenCounts | undefined {
  if (!object(value) || !count(value.prompt_tokens) || !count(value.output_tokens) || !count(value.total_tokens)
    || (value.thinking_tokens !== undefined && !count(value.thinking_tokens))) return;
  return { prompt_tokens: value.prompt_tokens, output_tokens: value.output_tokens, total_tokens: value.total_tokens,
    ...(value.thinking_tokens !== undefined ? { thinking_tokens: value.thinking_tokens } : {}) };
}
const reasons = new Set(["missing_usage", "failed_attempt", "request_timeout", "invalid_provider_output"]);
/** Missing/invalid telemetry must never prevent the checked answer from rendering. */
export function parseWorkflowUsage(value: unknown): WorkflowUsage | undefined {
  if (!object(value) || value.scope !== "current_request" || (typeof value.reuse !== "string" || !["none", "cache", "in_flight"].includes(value.reuse))
    || typeof value.complete !== "boolean" || !Array.isArray(value.calls) || !Array.isArray(value.incomplete_reasons)
    || !value.incomplete_reasons.every(reason => typeof reason === "string" && reasons.has(reason))) return;
  const totals = parseCounts(value.reported_totals);
  if (!totals) return;
  const calls: WorkflowUsage["calls"] = [];
  for (const call of value.calls) {
    if (!object(call) || (call.stage !== "triage" && call.stage !== "writer") || (call.provider !== "gemini" && call.provider !== "groq")
      || typeof call.model !== "string" || !call.model.trim()) return;
    const usage = call.usage === null ? null : parseCounts(call.usage);
    if (usage === undefined) return;
    calls.push({ stage: call.stage, provider: call.provider, model: call.model, usage });
  }
  // Reuse describes newly initiated work, not the original answer's token use.
  if (value.reuse !== "none" && (calls.length || Object.values(totals).some(n => n !== 0 && n !== undefined && n !== null)
    || totals.total_tokens !== 0 || totals.prompt_tokens !== 0 || totals.output_tokens !== 0)) return;
  const complete = value.complete && value.incomplete_reasons.length === 0
    && [totals.prompt_tokens, totals.output_tokens, totals.total_tokens].every(n => n !== null)
    && calls.every(call => call.usage && [call.usage.prompt_tokens, call.usage.output_tokens, call.usage.total_tokens].every(n => n !== null));
  return { scope: "current_request", reuse: value.reuse as WorkflowUsage["reuse"], calls, reported_totals: totals,
    complete, incomplete_reasons: value.incomplete_reasons as WorkflowUsage["incomplete_reasons"] };
}
export function workflowUsageLabel(usage: WorkflowUsage): string {
  if (usage.reuse === "cache") return "Cached answer; no new model work for this request.";
  if (usage.reuse === "in_flight") return "Shared an ongoing answer; this request started no additional model work.";
  const total = usage.reported_totals.total_tokens;
  if (total === null) return "This request: token usage unavailable; some usage unavailable.";
  const tokens = `${total.toLocaleString("en-US")} provider-reported tokens from returned generations`;
  return usage.complete ? `This request: ${tokens}.` : `Reported subtotal: ${tokens}; some usage unavailable.`;
}

export function parseAskWriterUsage(value: unknown): AiUsage | undefined {
  if (!object(value) || (value.provider !== "gemini" && value.provider !== "groq")
    || typeof value.model !== "string" || !value.model.trim() || value.source !== "live"
    || (typeof value.served !== "string" || !["live", "cached", "saved"].includes(value.served))) return;
  const counts = parseCounts(value);
  if (!counts) return;
  return { ...counts, provider: value.provider, model: value.model, source: "live", served: value.served as AiUsage["served"] };
}
