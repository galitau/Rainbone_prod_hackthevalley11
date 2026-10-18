import { fetchHistory, type HistoryRun, type HistoryState, type SimulationResult } from "@/lib/api";

// A filename is only a legacy fallback. New responses identify the execution
// that actually ran, even when identical bytes arrive under a different name.
export function matchingSimulationRuns(history: HistoryState, result: SimulationResult | undefined, filename: string): HistoryRun[] {
  if (history.status !== "ready") return [];
  return history.runs.filter(row => result?.run_id
    ? row.run_id === result.run_id && (!result.input_sha256 || row.input_sha256 === result.input_sha256)
    : row.source_filename === filename);
}

export async function readBackSimulation(
  result: SimulationResult,
  filename: string,
  onUpdate: (history: HistoryState) => void,
  isCurrent: () => boolean,
): Promise<void> {
  if (!isCurrent()) return;
  if (result.persistence === "unavailable") {
    onUpdate({ status: "unavailable", reason: "The result was returned, but its history was not saved." });
    return;
  }
  const deadline = Date.now() + 5_000;
  while (isCurrent() && Date.now() < deadline) {
    const next = await fetchHistory(12, result.original_source_filename ?? filename, Math.max(1, deadline - Date.now()), result.run_id);
    if (!isCurrent()) return;
    onUpdate(next);
    // Older APIs cannot acknowledge an exact execution. Read their filename
    // history once without pretending its rows prove this upload was saved.
    if (!result.run_id || next.status === "unavailable" ||
        matchingSimulationRuns(next, result, filename).length > 0 ||
        (next.status === "ready" && next.persistence === "unavailable")) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await new Promise(resolve => setTimeout(resolve, Math.min(500, remaining)));
  }
}
