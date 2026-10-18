import { parseAskWriterUsage, parseWorkflowUsage, workflowUsageLabel, type TokenCounts } from "@/lib/ask-usage";

function tokens(value: number | null | undefined) {
  return value == null ? "unavailable" : value.toLocaleString("en-US");
}
function Breakdown({ usage }: { usage: TokenCounts | null }) {
  if (!usage) return <span>Usage unavailable</span>;
  return <span>Prompt {tokens(usage.prompt_tokens)} · output {tokens(usage.output_tokens)} · total {tokens(usage.total_tokens)}
    {usage.thinking_tokens != null && <> · thinking {tokens(usage.thinking_tokens)} (included in output)</>}</span>;
}
/** Accept unknown so old APIs or invalid optional telemetry cannot break an answer. */
export function AskUsageLine({ workflowUsage, writerUsage }: { workflowUsage?: unknown; writerUsage?: unknown }) {
  const usage = parseWorkflowUsage(workflowUsage);
  if (!usage) return null;
  const writer = parseAskWriterUsage(writerUsage);
  return <div className="space-y-1 text-[10px] leading-4 text-muted" aria-label="Current request model usage">
    <p>{workflowUsageLabel(usage)}</p>
    <details>
      <summary className="cursor-pointer rounded text-body">Usage details</summary>
      <div className="mt-1 space-y-1">
        {writer && <p className="break-words">Writer selection: {writer.total_tokens == null ? "usage unavailable" : `${tokens(writer.total_tokens)} tokens from original generation`} · {writer.provider === "gemini" ? "Gemini" : "Groq"} · {writer.model}{writer.served !== "live" ? " · reused" : ""}. Original writer usage is a separate reference, not added to this request subtotal.</p>}
        {usage.calls.length > 0 && <ul className="space-y-1">{usage.calls.map((call, index) => <li key={index} className="break-words">
          <span className="font-medium text-body">{call.stage === "triage" ? "Triage" : "Writer selection"} · {call.provider === "gemini" ? "Gemini" : "Groq"} · {call.model}</span>
          <br /><Breakdown usage={call.usage} />
        </li>)}</ul>}
        <p>Code check; no model call.</p>
        <p>Provider-reported or normalized subtotals, not all tokens billed. Missing reports and failed attempts may be unavailable.</p>
      </div>
    </details>
  </div>;
}
