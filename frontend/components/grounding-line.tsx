import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Grounding, Logged } from "@/lib/api";

// One small line under an AI answer: where the API read its facts (the private Vultr Object Storage copy, checked
// against the sha256 pinned in the repository, or the copy bundled with the API, with the reason) and whether the
// answer was logged in Tiger Cloud. Nothing when the API sends neither (numbers from the request, or an older API).
export function GroundingLine({ grounding, logged, className = "" }: { grounding?: Grounding | null; logged?: Logged; className?: string }) {
  if (!grounding && !logged) return null;
  const fromBucket = grounding?.store === "vultr-object-storage";
  const parts = [
    grounding && (fromBucket
      ? "Facts read from Vultr Object Storage · sha256 verified"
      : `Facts from the bundled backup copy${grounding.reason ? ` (${grounding.reason})` : ""}`),
    logged && "Logged in Tiger Cloud",
  ].filter(Boolean);
  const detail = [grounding && `${grounding.key} · sha256 ${grounding.sha256}`, logged && `AI log row ${logged.id}`].filter(Boolean).join("\n");
  const Icon = grounding && !fromBucket ? ShieldAlert : ShieldCheck;
  return (
    <p className={`flex items-start gap-1.5 ${className}`} title={detail}>
      <Icon size={13} className={`mt-[3px] shrink-0 ${grounding && !fromBucket ? "text-caution" : "text-success"}`} aria-hidden />
      <span>{parts.join(" · ")}</span>
    </p>
  );
}
