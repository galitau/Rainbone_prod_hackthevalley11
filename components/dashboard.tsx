"use client";

import { Bone, Database } from "lucide-react";
import { BoneViewer } from "@/components/BoneViewer";
import { FemurFindings } from "@/components/femur-findings";
import { LiveRun } from "@/components/live-run";
import { PlainExplanation } from "@/components/plain-explanation";
import { API_BASE_URL, type ExplanationState, type HistoryState, type SimulationResult } from "@/lib/api";
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

// 800 N is the weight of about 80 kg (800 / 9.81 = 81.5), rounded to 5 kg.
const LOAD_AS_KG = Math.round(FEMUR_MODEL.loadNewtons / 9.81 / 5) * 5;
const STRESS_OPTION = "FEA · von Mises stress"; // the label of BoneViewer's stress option

export function Dashboard({ run, explanation, history, health, onRunSample, onUpload }: DashboardProps) {
  return (
    // From lg up the page is one screen: the viewer fills the space between header and footer, the panel scrolls.
    <div className="flex min-h-screen flex-col lg:h-dvh lg:min-h-[640px]">
      <header className="z-20 border-b border-line bg-canvas/90 backdrop-blur sm:sticky sm:top-0 lg:static">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rainbow text-white shadow-card">
              <Bone size={17} strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold tracking-tight">RainbowBone</p>
              <p className="truncate text-label text-muted">Bone stress simulation</p>
            </div>
          </div>
          <ApiStatus health={health} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:min-h-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Where a real thigh bone takes the strain</h1>
          <p className="mt-1 max-w-[110ch] text-sm leading-6 text-muted">
            <span className="sm:hidden">
              A patient&apos;s right femur from a CT scan, pressed at the hip with {FEMUR_MODEL.loadNewtons} N. Pick “{STRESS_OPTION}” in
              the viewer to colour it by stress.
            </span>
            <span className="hidden sm:inline">
              The right femur from a patient&apos;s CT scan ({FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}), pressed down at the hip with{" "}
              {FEMUR_MODEL.loadNewtons} N (about the weight of an {LOAD_AS_KG} kg person) while the knee end is held still. Pick “
              {STRESS_OPTION}” in the viewer to colour it by stress.
            </span>
          </p>
          <p className="mt-1 text-label text-muted sm:hidden">
            <span className="text-ink">Data:</span> <SourceLink /> · {FEMUR_MODEL.license} · {FEMUR_INSTITUTION || FEMUR_AUTHORS}
          </p>
        </div>

        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* The viewer keeps its dark stage. The wrapper only sizes it: from lg up the canvas flexes to fill the
              column (its own minimum height is lifted) so the whole viewer, legend included, ends above the footer. */}
          <div className="theme-stage flex min-w-0 flex-col lg:min-h-0 [&>section]:flex [&>section]:min-h-0 [&>section]:flex-1 [&>section]:flex-col max-sm:[&>section>div.relative]:min-h-[48vh] lg:[&>section>div.relative]:min-h-0">
            <BoneViewer />
          </div>
          {/* relative: keeps the visually hidden file input inside the scrolling panel, so the page itself never scrolls */}
          <aside className="relative min-w-0 space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pb-1" aria-label="Results">
            <FemurFindings />
            <PlainExplanation state={explanation} />
            <LiveRun run={run} history={history} onRunSample={onRunSample} onUpload={onUpload} />
          </aside>
        </div>
      </main>

      <SourceBar />
    </div>
  );
}

const HEALTH = {
  checking: { short: "Checking", long: "Checking the live engine", dot: "bg-muted", text: "text-muted" },
  online: { short: "Engine online", long: "Live engine online", dot: "bg-ok", text: "text-ok" },
  // A browser cannot tell a server that is down from one that refuses this page's origin (CORS), so say only that.
  offline: { short: "Engine unreachable", long: "Live engine not reachable from this page", dot: "bg-warning", text: "text-warning" },
} as const;

function ApiStatus({ health }: { health: ApiHealth }) {
  const state = HEALTH[health];
  return (
    <span
      role="status"
      title={`GET ${API_BASE_URL}/health, checked every 15 s`}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-label font-medium shadow-card"
    >
      <span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden />
      <span className={state.text}>
        <span className="sm:hidden">{state.short}</span>
        <span className="hidden sm:inline">{state.long}</span>
      </span>
    </span>
  );
}

function SourceLink() {
  return (
    <a
      href={FEMUR_MODEL.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-block py-1 text-accent underline underline-offset-2 sm:py-0 sm:no-underline sm:hover:underline"
    >
      {FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}
    </a>
  );
}

// Where the 3D model and the numbers come from. Sticky from sm to lg; in the one-screen layout (lg) it is
// always in view anyway; on a phone it sits at the end so it never covers the viewer's colour legend.
function SourceBar() {
  return (
    <footer className="z-20 border-t border-line bg-panel/95 backdrop-blur sm:sticky sm:bottom-0 lg:static">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-1 px-4 py-2.5 text-label text-muted sm:px-6 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-6">
        <p className="flex items-start gap-1.5">
          <Database size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="text-ink">3D femur:</span> <SourceLink /> · {FEMUR_MODEL.license} · {FEMUR_AUTHORS}
            {FEMUR_INSTITUTION && `, ${FEMUR_INSTITUTION}`}
          </span>
        </p>
        <p className="pl-[19px] lg:pl-0">
          <span className="text-ink">Femur numbers:</span> its own {FEMUR_MODEL.solver} solve, done ahead of time · Research prototype,
          not a medical device
        </p>
      </div>
    </footer>
  );
}
