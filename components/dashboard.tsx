"use client";

import { Bone, Database } from "lucide-react";
import { BoneViewer } from "@/components/BoneViewer";
import { LiveRun } from "@/components/live-run";
import { PlainExplanation } from "@/components/plain-explanation";
import { API_BASE_URL, API_HOST, type ExplanationState, type HistoryState, type SimulationResult } from "@/lib/api";
import { FEMUR_AUTHORS, FEMUR_INSTITUTION, FEMUR_MODEL } from "@/lib/model";

export type ApiHealth = "checking" | "online" | "offline";
export type RunInput = { name: string; kind: "sample" | "upload" };
export type RunState =
  | { status: "loading"; input: RunInput }
  | { status: "ready"; input: RunInput; result: SimulationResult; ms: number }
  | { status: "error"; input: RunInput; message: string };

type DashboardProps = {
  run: RunState;
  explanation: ExplanationState;
  history: HistoryState;
  health: ApiHealth;
  onRunSample: () => void;
  onUpload: (file: File) => void;
};

export function Dashboard({ run, explanation, history, health, onRunSample, onUpload }: DashboardProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rainbow text-white shadow-card">
              <Bone size={17} strokeWidth={2.25} aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">RainbowBone</p>
              <p className="text-label text-muted">Bone stress simulation</p>
            </div>
          </div>
          <ApiStatus health={health} />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-label font-medium text-accent">
              Finite-element simulation · {FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem] sm:leading-9">
              {FEMUR_MODEL.anatomy}, loaded with {FEMUR_MODEL.loadNewtons} N
            </h1>
            <p className="mt-1.5 max-w-[100ch] text-sm leading-6 text-muted">
              A patient-derived bone from the {FEMUR_MODEL.dataset} CT collection, solved in {FEMUR_MODEL.solver}. Switch the view
              to stress or displacement to see where it carries the load.
            </p>
          </div>
          {/* The viewer keeps its dark stage; the wrapper only sizes it so the canvas fills the column. */}
          <div className="theme-stage flex flex-col lg:min-h-[calc(100dvh-15.5rem)] [&>section]:flex [&>section]:flex-1 [&>section]:flex-col">
            <BoneViewer />
          </div>
        </div>
        <aside className="min-w-0 space-y-4" aria-label="Live simulation results">
          <LiveRun run={run} history={history} onRunSample={onRunSample} onUpload={onUpload} />
          {run.status === "ready" && <PlainExplanation state={explanation} />}
        </aside>
      </main>

      <SourceBar run={run} />
    </div>
  );
}

const HEALTH = {
  checking: { label: "Checking API", dot: "bg-muted", text: "text-muted" },
  online: { label: "API online", dot: "bg-ok", text: "text-ok" },
  offline: { label: "API offline", dot: "bg-warning", text: "text-warning" },
} as const;

function ApiStatus({ health }: { health: ApiHealth }) {
  const state = HEALTH[health];
  return (
    <span
      role="status"
      title={`GET ${API_BASE_URL}/health, checked every 15 s`}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-label font-medium shadow-card"
    >
      <span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden />
      <span className={state.text}>{state.label}</span>
      <span className="hidden font-mono text-muted sm:inline">{API_HOST}</span>
    </span>
  );
}

// Always on screen: where the 3D model and the numbers come from.
function SourceBar({ run }: { run: RunState }) {
  const input = run.input.kind === "sample" ? `${run.input.name} (synthetic test volume)` : run.input.name;
  return (
    <footer className="sticky bottom-0 z-20 border-t border-line bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-0.5 px-4 py-2 text-label text-muted sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <p className="flex min-w-0 items-center gap-1.5">
          <Database size={13} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate">
            <span className="text-ink">
              <span className="sm:hidden">Femur:</span>
              <span className="hidden sm:inline">3D model:</span>
            </span>{" "}
            <a href={FEMUR_MODEL.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              {FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}
            </a>{" "}
            ({FEMUR_MODEL.license}) · {FEMUR_AUTHORS}
            {FEMUR_INSTITUTION && <span className="hidden sm:inline">, {FEMUR_INSTITUTION}</span>}
          </span>
        </p>
        <p className="truncate pl-[19px] sm:pl-0">
          <span className="text-ink">Numbers:</span>{" "}
          <span className="sm:hidden">live API run · Not a medical device</span>
          <span className="hidden sm:inline">
            live from the RainbowBone API<span className="hidden xl:inline"> · {input}</span> · Research prototype, not a medical device
          </span>
        </p>
      </div>
    </footer>
  );
}
