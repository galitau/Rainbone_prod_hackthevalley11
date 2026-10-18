// Base URL of the FastAPI backend. Next.js inlines NEXT_PUBLIC_* variables at build time.
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// Host and port of the backend, for labels ("127.0.0.1:8000").
export const API_HOST = API_BASE_URL.replace(/^https?:\/\//, "");

// The fields of a POST /api/simulate response that the dashboard shows.
export type SimulationResult = {
  max_von_mises_stress_mpa: number;
  average_youngs_modulus_gpa: number;
  bone_volume_cm3: number;
  fracture_risk_index_percent: number;
  load_newtons?: number;
  mesh_vertices?: number;
  mesh_faces?: number;
  source_filename?: string;
};

export type SimulationOutcome =
  | { ok: true; result: SimulationResult; ms: number }
  | { ok: false; message: string; reachedApi: boolean };

// Posts one NIfTI file to /api/simulate. Never throws.
export async function runSimulation(file: File): Promise<SimulationOutcome> {
  const form = new FormData();
  form.append("file", file);
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(apiUrl("/api/simulate"), { method: "POST", body: form });
  } catch {
    return { ok: false, reachedApi: false, message: `Could not reach the simulation API at ${API_HOST}.` };
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail.slice(0, 220);
    } catch {
      // no JSON body
    }
    return { ok: false, reachedApi: true, message: `The API could not solve this scan (HTTP ${response.status})${detail ? `: ${detail}` : "."}` };
  }
  try {
    const result = (await response.json()) as SimulationResult;
    if (typeof result.max_von_mises_stress_mpa === "number" && typeof result.fracture_risk_index_percent === "number") {
      return { ok: true, result, ms: performance.now() - started };
    }
  } catch {
    // fall through to the error below
  }
  return { ok: false, reachedApi: true, message: "The API answered without simulation results." };
}

// GET /health: true only when the API answers {"status": "ok"}. Never throws.
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl("/health"), { cache: "no-store" });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: unknown };
    return body.status === "ok";
  } catch {
    return false;
  }
}

export type HistoryRun = { time: string; max_von_mises_stress_mpa: number; source_filename: string };

// "unavailable": the API has no saved history (no database configured answers 503, an older API 404).
export type HistoryState =
  | { status: "loading" }
  | { status: "ready"; runs: HistoryRun[] }
  | { status: "unavailable"; reason: string };

// GET /api/history: saved /api/simulate results, oldest first. Never throws.
export async function fetchHistory(limit = 12): Promise<HistoryState> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/history?limit=${limit}`), { cache: "no-store" });
  } catch {
    return { status: "unavailable", reason: "API unreachable" };
  }
  if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
  try {
    const body = (await response.json()) as { runs?: HistoryRun[] };
    if (Array.isArray(body.runs)) return { status: "ready", runs: body.runs };
  } catch {
    // fall through
  }
  return { status: "unavailable", reason: "no runs in the answer" };
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
