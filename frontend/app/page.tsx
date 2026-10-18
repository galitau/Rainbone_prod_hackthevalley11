"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dashboard, type ApiHealth, type RunInput, type RunState } from "@/components/dashboard";
import {
  checkHealth,
  fetchExplanation,
  fetchHistory,
  fetchRiskAnalysis,
  runSimulation,
  type ExplanationState,
  type HistoryState,
  type RiskAnalysisState,
} from "@/lib/api";
import { FEMUR_EXPLAIN_REQUEST, FEMUR_MODEL, FEMUR_RISK_FE } from "@/lib/model";
import { readPreferences } from "@/lib/preferences";

const SAMPLE: RunInput = { name: "sample_bone.nii.gz", kind: "sample" };
const HEALTH_POLL_MS = 15_000;

async function loadSample(): Promise<File> {
  const scan = await fetch(`/${SAMPLE.name}`);
  if (!scan.ok) throw new Error("Sample scan unavailable");
  return new File([await scan.blob()], SAMPLE.name, { type: "application/gzip" });
}

export default function Home() {
  const [run, setRun] = useState<RunState>({ status: "loading", input: SAMPLE });
  const [explanation, setExplanation] = useState<ExplanationState>({ status: "loading" });
  const [risk, setRisk] = useState<RiskAnalysisState>({ status: "loading" });
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const [health, setHealth] = useState<ApiHealth>("checking");
  const latestRun = useRef(0);
  const mounted = useRef(true);

  const refreshHealth = useCallback(async () => {
    const online = await checkHealth();
    if (mounted.current) setHealth(online ? "online" : "offline");
  }, []);

  // The plain-words card explains the femur on screen: its numbers come from the model manifest, not from a live run.
  const explainFemur = useCallback(async () => {
    setExplanation({ status: "loading" });
    const explained = await fetchExplanation(FEMUR_EXPLAIN_REQUEST);
    if (mounted.current) setExplanation(explained);
  }, []);

  // The AI risk card reads the published HFValid numbers of the same subject, by the case id in the model manifest.
  const analyseRisk = useCallback(async () => {
    setRisk({ status: "loading" });
    const analysed = await fetchRiskAnalysis(FEMUR_MODEL.caseId, FEMUR_RISK_FE);
    if (mounted.current) setRisk(analysed);
  }, []);

  // The live engine check: posts a NIfTI volume to /api/simulate and shows what comes back.
  const simulate = useCallback(async (getFile: () => Promise<File>, input: RunInput) => {
    const id = ++latestRun.current;
    setRun({ status: "loading", input });
    let file: File;
    try {
      file = await getFile();
    } catch {
      if (id === latestRun.current) setRun({ status: "error", input, message: "The sample scan could not be loaded from this site." });
      return;
    }
    const outcome = await runSimulation(file);
    if (id !== latestRun.current) return;
    setRun(outcome.ok ? { status: "ready", input, result: outcome.result, ms: outcome.ms } : { status: "error", input, message: outcome.message });
    void refreshHealth(); // the API answered (or not), so don't leave an older status on screen until the next poll
    if (!outcome.ok) return;
    // The API saves a run after it has answered, so read the history once that save has had time to finish.
    window.setTimeout(() => void fetchHistory().then((next) => mounted.current && setHistory(next)), 1500);
  }, [refreshHealth]);

  const runSample = useCallback(() => simulate(loadSample, SAMPLE), [simulate]);
  const runUpload = useCallback((file: File) => simulate(async () => file, { name: file.name, kind: "upload" }), [simulate]);

  useEffect(() => {
    mounted.current = true;
    void refreshHealth();
    void explainFemur();
    void analyseRisk();
    // Preferences can turn the automatic sample run off; "Run the sample" still runs it.
    if (readPreferences().autoRunSample) void runSample();
    else setRun({ status: "idle", input: SAMPLE });
    void fetchHistory().then((next) => mounted.current && setHistory(next));
    const timer = window.setInterval(() => void refreshHealth(), HEALTH_POLL_MS);
    return () => {
      window.clearInterval(timer);
      mounted.current = false;
      latestRun.current += 1; // ignore a run that finishes after unmount
    };
  }, [refreshHealth, explainFemur, analyseRisk, runSample]);

  // When the API comes back after being unreachable, fetch the explanation and risk analysis the page could not get earlier.
  const previousHealth = useRef<ApiHealth>("checking");
  useEffect(() => {
    if (previousHealth.current === "offline" && health === "online") {
      if (explanation.status === "unavailable") void explainFemur();
      if (risk.status === "unavailable") void analyseRisk();
    }
    previousHealth.current = health;
  }, [health, explanation.status, risk.status, explainFemur, analyseRisk]);

  return (
    <Dashboard
      run={run}
      explanation={explanation}
      risk={risk}
      history={history}
      health={health}
      onRunSample={runSample}
      onUpload={runUpload}
    />
  );
}
