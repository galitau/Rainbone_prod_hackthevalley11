// Base URL of the FastAPI backend. Next.js inlines NEXT_PUBLIC_* variables at build time.
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export type Explanation = {
  text: string;
  provider: "gemini" | "groq" | "template";
  model: string | null;
  fallbacks: { provider: string; reason: string }[];
};

// "unavailable": the backend has no /api/explain (404), so the dashboard shows nothing for it.
export type ExplanationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; explanation: Explanation }
  | { status: "unavailable" }
  | { status: "error"; message: string };

// Posts a /api/simulate response, unchanged, to /api/explain. Never throws.
export async function fetchExplanation(simulation: unknown): Promise<ExplanationState> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/api/explain"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(simulation),
    });
  } catch {
    return { status: "error", message: "Could not reach the explanation service." };
  }
  if (response.status === 404) return { status: "unavailable" };
  if (!response.ok) return { status: "error", message: `Explanation request failed (${response.status}).` };
  try {
    const explanation = (await response.json()) as Explanation;
    if (typeof explanation.text === "string" && explanation.text.trim()) return { status: "ready", explanation };
  } catch {
    // fall through to the error below
  }
  return { status: "error", message: "The explanation service returned no text." };
}
