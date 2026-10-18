import { apiUrl, type Grounding, type Logged } from "@/lib/api";
import type { AiAnswerSource } from "@/lib/ai-label";

export const ASK_EVENT = "rainbone:ask";
export const ASK_ROUTES = ["/dashboard", "/physics-simulations", "/lesion-progression", "/bones", "/datasets", "/preferences"];
export function openAskRainbone(question = "") {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: question.slice(0, 500) }));
}
export type AskSource = { id: string; label: string; kind: string; url?: string };
export type AskAnswer = AiAnswerSource & {
  answer: string; sources: AskSource[]; steps: string[]; grounding: Grounding | null; logged: Logged | null;
};

export function checkedAskUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (ASK_ROUTES.includes(value)) return value;
  return ["https://doi.org/10.6092/unibo/amsacta/8431", "https://pubmed.ncbi.nlm.nih.gov/8618384/", "/models/hfvalid-femur/manifest.json"].includes(value) ? value : undefined;
}

export function parseAskAnswer(value: unknown): AskAnswer {
  if (!value || typeof value !== "object") throw new Error("Rainbone returned an incomplete answer. Please try again.");
  const v = value as Record<string, unknown>;
  if (typeof v.answer !== "string" || !v.answer.trim() || !["gemini", "groq", "template"].includes(String(v.provider))
    || !["live", "cached", "saved"].includes(String(v.served)) || !(v.model === null || typeof v.model === "string")
    || !Array.isArray(v.sources) || !Array.isArray(v.steps) || !v.steps.every(step => typeof step === "string"))
    throw new Error("Rainbone returned an incomplete answer. Please try again.");
  const sources = v.sources.map((source: unknown) => {
    if (!source || typeof source !== "object") throw new Error("Rainbone returned an invalid source.");
    const s = source as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.label !== "string" || typeof s.kind !== "string") throw new Error("Rainbone returned an invalid source.");
    return { id: s.id, label: s.label, kind: s.kind, url: checkedAskUrl(typeof s.url === "string" ? s.url : undefined) };
  });
  const grounding = v.grounding as Record<string, unknown> | null;
  if (grounding && (typeof grounding !== "object" || !["vultr-object-storage", "local-backup"].includes(String(grounding.store))
    || grounding.verified !== true || typeof grounding.key !== "string" || typeof grounding.sha256 !== "string"
    || !(grounding.reason == null || typeof grounding.reason === "string"))) throw new Error("Rainbone could not verify the answer's source details.");
  const logged = v.logged as Record<string, unknown> | null;
  if (logged && (typeof logged !== "object" || logged.store !== "tiger" || typeof logged.id !== "string"))
    throw new Error("Rainbone returned invalid save details.");
  return { ...v, sources, grounding: grounding ?? null, logged: logged ?? null } as AskAnswer;
}

export async function askRainbone(question: string, page: string, signal: AbortSignal): Promise<AskAnswer> {
  const response = await fetch(apiUrl("/api/ask"), {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ question: question.trim(), case_id: "Pat001", ...(ASK_ROUTES.includes(page) ? { page } : {}) }),
  });
  if (response.status === 429) {
    const raw = response.headers.get("Retry-After");
    const seconds = raw ? Number(raw) : NaN;
    const delay = Number.isFinite(seconds) ? seconds : raw ? Math.ceil((Date.parse(raw) - Date.now()) / 1000) : NaN;
    throw new Error(`Too many questions. ${Number.isFinite(delay) && delay > 0 ? `Try again in ${Math.ceil(delay)} seconds.` : "Please wait a moment and try again."}`);
  }
  if (!response.ok) throw new Error(response.status === 503 ? "Rainbone's checked facts are temporarily unavailable. Please try again." : `Rainbone could not answer (HTTP ${response.status}). Please try again.`);
  return parseAskAnswer(await response.json());
}
