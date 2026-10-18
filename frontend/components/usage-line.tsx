import { Cpu } from "lucide-react";
import { GEMINI_PROMPT_FOOTPRINT, USAGE_WHY, usageLine, type UsageSource } from "@/lib/ai-usage";

// The token footprint of one AI answer (see lib/ai-usage.ts): nothing for the template or an older API.
export function UsageLine({ answer }: { answer: UsageSource }) {
  const line = usageLine(answer);
  if (!line) return null;
  return (
    <p className="flex items-start gap-1.5" title={USAGE_WHY} aria-description={USAGE_WHY}>
      <Cpu size={13} className="mt-[3px] shrink-0" aria-hidden />
      <span>
        {line.text}
        {line.estimate && (
          <>
            {" · "}{line.estimate}{" "}
            <a href={GEMINI_PROMPT_FOOTPRINT.url} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">({GEMINI_PROMPT_FOOTPRINT.label})</a>
          </>
        )}
      </span>
    </p>
  );
}
