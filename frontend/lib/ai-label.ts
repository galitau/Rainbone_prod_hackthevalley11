// What wrote an AI answer, in words that are true of every answer the API sends (POST /api/explain and
// /api/risk-analysis): a Gemini answer names its model; a saved Gemini answer (no Gemini model answered this time,
// so the API served the one Gemini wrote earlier for the same facts) says when it was written; Groq is the backup
// model; the template is no AI at all.
export type AiAnswerSource = {
  provider: string;
  model: string | null;
  served?: "live" | "cached" | "saved"; // absent from older APIs, which only sent live answers
  saved_at?: string | null;
};

const TIME = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// HH:MM in the reader's time zone, with the date in front when it was not today.
function savedTime(savedAt: string | null | undefined) {
  const at = savedAt ? new Date(savedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const today = new Date().toDateString() === at.toDateString();
  return today ? TIME.format(at) : `${DAY.format(at)}, ${TIME.format(at)}`;
}

export function aiAnswerLabel({ provider, model, served, saved_at }: AiAnswerSource): string {
  if (provider === "gemini") {
    if (served === "saved") {
      const at = savedTime(saved_at);
      return at ? `Gemini · saved answer from ${at}` : "Gemini · saved answer";
    }
    return model ? `Gemini · ${model}` : "Gemini";
  }
  if (provider === "groq") return `Backup model · Groq${model ? ` ${model}` : ""}`;
  if (provider === "template") return "Offline summary (no AI)";
  return model ? `${provider} · ${model}` : provider;
}
