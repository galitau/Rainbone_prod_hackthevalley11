// Base URL of the FastAPI backend. Next.js inlines NEXT_PUBLIC_* variables at build time.
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// Host and port of the backend, for labels ("127.0.0.1:8000").
export const API_HOST = API_BASE_URL.replace(/^https?:\/\//, "");

// Per-request time limits, so a slow or stuck API never leaves the page waiting forever.
const SIMULATE_TIMEOUT_MS = 90_000;
const SHORT_TIMEOUT_MS = 5_000; // /health and /api/history
// Above the backend's worst case (Gemini 10 s, its fallback model 10 s, Groq 8 s), so its template can still answer.
const EXPLAIN_TIMEOUT_MS = 35_000;

// AbortSignal.timeout is missing on older browsers (Safari before 16); there the request simply has no limit.
function timeout(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

const timedOut = (cause: unknown) => cause instanceof DOMException && cause.name === "TimeoutError";

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
    response = await fetch(apiUrl("/api/simulate"), { method: "POST", body: form, signal: timeout(SIMULATE_TIMEOUT_MS) });
  } catch (cause) {
    if (timedOut(cause)) return { ok: false, reachedApi: false, message: `The API did not answer within ${SIMULATE_TIMEOUT_MS / 1000} s.` };
    // A browser cannot tell a server that is down from one that refuses this page's origin (CORS).
    return { ok: false, reachedApi: false, message: `This page could not reach the simulation API at ${API_HOST}.` };
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
    const response = await fetch(apiUrl("/health"), { cache: "no-store", signal: timeout(SHORT_TIMEOUT_MS) });
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
    response = await fetch(apiUrl(`/api/history?limit=${limit}`), { cache: "no-store", signal: timeout(SHORT_TIMEOUT_MS) });
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

// "unavailable": the backend has no /api/explain (404) or this page cannot reach it, so the dashboard shows
// nothing for it (the header already says when the API is unreachable).
export type ExplanationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; explanation: Explanation }
  | { status: "unavailable" }
  | { status: "error"; message: string };

// Posts simulation numbers (the fields of a /api/simulate response) to /api/explain. Never throws.
export async function fetchExplanation(simulation: unknown): Promise<ExplanationState> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/api/explain"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(simulation),
      signal: timeout(EXPLAIN_TIMEOUT_MS),
    });
  } catch (cause) {
    if (timedOut(cause)) return { status: "error", message: `The explanation did not arrive within ${EXPLAIN_TIMEOUT_MS / 1000} s.` };
    return { status: "unavailable" };
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

// The femur's finite-element numbers sent along with its HFValid subject; the API echoes them back in facts.fe.
export type RiskFeNumbers = { peak_stress_mpa: number; load_newtons: number; stress_index_percent: number };

// The published numbers behind a risk analysis: the subject's own HFValid row, where it sits among the study's
// women, and the factor of risk (sideways-fall impact force divided by the femur's sideways-fall strength).
export type RiskFacts = {
  age: number;
  arf0_percent: number;
  arf0_higher_than: number; // how many subjects have a lower ARF0
  cohort_n: number;
  cohort_median_arf0_percent: number;
  cohort_fractured: number;
  fractured_arf0_min_percent: number | null; // null when nobody in the cohort fractured
  fractured_arf0_max_percent: number | null;
  msf_newtons: number;
  msf_lower_than: number; // how many subjects have a higher (stronger) MSF
  fall_force_low_newtons: number;
  fall_force_high_newtons: number;
  factor_of_risk_low: number;
  factor_of_risk_high: number;
  fractured_within_followup: boolean;
  days_ct_to_fracture: number | null;
  fe: RiskFeNumbers | null;
};

export type RiskAnalysis = {
  case_id: string;
  facts: RiskFacts;
  text: string;
  provider: "gemini" | "groq" | "template";
  model: string | null;
  fallbacks: { provider: string; reason: string }[];
  source: { citation: string; doi: string; license: string };
};

// "unavailable": the API has no /api/risk-analysis or no published data for this case (404), or this page cannot
// reach it, so the dashboard shows nothing for it.
export type RiskAnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; analysis: RiskAnalysis }
  | { status: "unavailable" }
  | { status: "error"; message: string };

// The same Gemini → Groq → template chain as /api/explain, so the same time limit.
const RISK_TIMEOUT_MS = EXPLAIN_TIMEOUT_MS;

const RISK_NUMBERS = [
  "age", "arf0_percent", "arf0_higher_than", "cohort_n", "cohort_fractured", "msf_newtons", "msf_lower_than",
  "fall_force_low_newtons", "fall_force_high_newtons", "factor_of_risk_low", "factor_of_risk_high",
] as const;
const RISK_NULLABLE_NUMBERS = ["fractured_arf0_min_percent", "fractured_arf0_max_percent"] as const;
const isFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

function isRiskAnalysis(body: unknown): body is RiskAnalysis {
  const answer = body as Partial<RiskAnalysis> | null;
  const facts = answer?.facts as Record<string, unknown> | undefined;
  return (
    typeof answer?.text === "string" && answer.text.trim() !== "" &&
    typeof facts === "object" && facts !== null &&
    RISK_NUMBERS.every((name) => isFiniteNumber(facts[name])) &&
    RISK_NULLABLE_NUMBERS.every((name) => facts[name] === null || isFiniteNumber(facts[name]))
  );
}

// Posts one HFValid case id (and the femur's own solve) to /api/risk-analysis. Never throws.
export async function fetchRiskAnalysis(caseId: string, fe?: RiskFeNumbers): Promise<RiskAnalysisState> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/api/risk-analysis"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fe ? { case_id: caseId, fe } : { case_id: caseId }),
      signal: timeout(RISK_TIMEOUT_MS),
    });
  } catch (cause) {
    if (timedOut(cause)) return { status: "error", message: `The risk analysis did not arrive within ${RISK_TIMEOUT_MS / 1000} s.` };
    return { status: "unavailable" };
  }
  if (response.status === 404) return { status: "unavailable" };
  if (!response.ok) return { status: "error", message: `Risk analysis request failed (${response.status}).` };
  try {
    const analysis: unknown = await response.json();
    if (isRiskAnalysis(analysis)) return { status: "ready", analysis };
  } catch {
    // fall through to the error below
  }
  return { status: "error", message: "The risk analysis service returned no usable answer." };
}
