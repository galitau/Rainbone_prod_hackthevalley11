"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dashboard, type ApiHealth, type RunInput, type RunState } from "@/components/dashboard";
import {
  checkHealth,
  fetchExplanation,
  fetchHistory,
  runSimulation,
  type ExplanationState,
  type HistoryState,
} from "@/lib/api";

const SAMPLE: RunInput = { name: "sample_bone.nii.gz", kind: "sample" };
const HEALTH_POLL_MS = 15_000;

async function loadSample(): Promise<File> {
  const scan = await fetch(`/${SAMPLE.name}`);
  if (!scan.ok) throw new Error("Sample scan unavailable");
  return new File([await scan.blob()], SAMPLE.name, { type: "application/gzip" });
}

export default function Home() {
  const [run, setRun] = useState<RunState>({ status: "loading", input: SAMPLE });
  const [explanation, setExplanation] = useState<ExplanationState>({ status: "idle" });
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const [health, setHealth] = useState<ApiHealth>("checking");
  const latestRun = useRef(0);

  const refreshHealth = useCallback(async () => {
    setHealth((await checkHealth()) ? "online" : "offline");
  }, []);

  const simulate = useCallback(async (getFile: () => Promise<File>, input: RunInput) => {
    const id = ++latestRun.current;
    setRun({ status: "loading", input });
    setExplanation({ status: "idle" });
    let file: File;
    try {
      file = await getFile();
    } catch {
      if (id === latestRun.current) setRun({ status: "error", input, message: "The sample scan could not be loaded from this site." });
      return;
    }
    const outcome = await runSimulation(file);
    if (id !== latestRun.current) return;
    if (!outcome.ok) {
      setRun({ status: "error", input, message: outcome.message });
      void refreshHealth();
      return;
    }
    setRun({ status: "ready", input, result: outcome.result, ms: outcome.ms });
    void refreshHealth(); // the API answered, so don't leave an older "offline" on screen until the next poll
    setExplanation({ status: "loading" });
    const explained = await fetchExplanation(outcome.result);
    if (id === latestRun.current) setExplanation(explained);
    // The API saves a run after it has answered, so read the history once that save has had time to finish.
    window.setTimeout(() => void fetchHistory().then(setHistory), 1500);
  }, [refreshHealth]);

  const runSample = useCallback(() => simulate(loadSample, SAMPLE), [simulate]);
  const runUpload = useCallback((file: File) => simulate(async () => file, { name: file.name, kind: "upload" }), [simulate]);

  useEffect(() => {
    void refreshHealth();
    void runSample();
    void fetchHistory().then(setHistory);
    const timer = window.setInterval(() => void refreshHealth(), HEALTH_POLL_MS);
    return () => {
      window.clearInterval(timer);
      latestRun.current += 1; // ignore a run that finishes after unmount
    };
  }, [refreshHealth, runSample]);

  return (
    <Dashboard
      run={run}
      explanation={explanation}
      history={history}
      health={health}
      onRunSample={runSample}
      onUpload={runUpload}
    />
  );
}
