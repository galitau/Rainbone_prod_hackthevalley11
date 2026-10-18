"use client";

import { useRef } from "react";
import { Activity, FileUp, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BoneViewer } from "@/components/BoneViewer";
import { ClinicalMetrics } from "@/components/clinical-metrics";
import { FractureRisk } from "@/components/fracture-risk";
import { LiveRun, ALL_NUMBERS_ID } from "@/components/live-run";
import { PlainExplanation } from "@/components/plain-explanation";
import { StressChart } from "@/components/stress-chart";
import { API_BASE_URL, type ExplanationState, type HistoryState, type SimulationResult } from "@/lib/api";
import { FEMUR_AUTHORS, FEMUR_INSTITUTION, FEMUR_MODEL } from "@/lib/model";
const PhysicsSimulations = dynamic(() => import("@/components/physics-simulations").then(module => module.PhysicsSimulations));

export type ApiHealth = "checking" | "online" | "offline";
export type RunInput = { name: string; kind: "sample" | "upload" };
export type RunState =
  | { status: "loading"; input: RunInput }
  | { status: "ready"; input: RunInput; result: SimulationResult; ms: number }
  | { status: "error"; input: RunInput; message: string };

type OverviewProps = {
  view?: "overview";
  run: RunState;
  explanation: ExplanationState;
  history: HistoryState;
  health: ApiHealth;
  onRunSample: () => void;
  onUpload: (file: File) => void;
};

// app/physics-simulations/page.tsx renders <Dashboard view="physics" />.
type DashboardProps = OverviewProps | { view: "physics" };

export function Dashboard(props: DashboardProps) {
  const view = props.view === "physics" ? "physics" : "overview";
  const health = props.view === "physics" ? undefined : props.health;
  return (
    <main className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 border-r border-line bg-[#0a1119] px-5 py-6 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan text-[#071318]">
              <Activity size={19} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-ink">RainbowBone</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Biomechanics lab</p>
            </div>
          </div>
          <nav className="mt-12 space-y-1.5">
            <NavItem active={view === "overview"} href="/" icon={<LayoutDashboard size={17} />} label="Overview" />
            <NavItem active={view === "physics"} href="/physics-simulations" icon={<Activity size={17} />} label="Physics simulations" />
            <NavItem icon={<FileUp size={17} />} label="Imaging library" />
          </nav>
          {health && (
            <div className="mt-auto rounded-xl border border-line bg-panel p-4">
              <ApiStatus health={health} />
              <p className="mt-2 text-xs leading-5 text-muted">{HEALTH[health].detail}</p>
            </div>
          )}
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[76px] items-center justify-between border-b border-line px-5 md:px-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">Bone stress simulation</p>
              <h1 className="mt-1 text-lg font-medium tracking-tight text-ink">{view === "physics" ? "Physics simulations" : "Patient analysis"}</h1>
            </div>
            {health && <div className="lg:hidden"><ApiStatus health={health} /></div>}
          </header>
          <nav aria-label="Mobile workspace navigation" className="flex gap-2 border-b border-line px-5 py-3 lg:hidden">
            <NavItem active={view === "overview"} href="/" icon={<LayoutDashboard size={15} />} label="Overview" />
            <NavItem active={view === "physics"} href="/physics-simulations" icon={<Activity size={15} />} label="Physics simulations" />
          </nav>

          {props.view === "physics" ? <PhysicsSimulations /> : <Overview {...props} />}
        </section>
      </div>
    </main>
  );
}

function Overview({ run, explanation, history, onRunSample, onUpload }: OverviewProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  // Saved runs of the same input as the live run, so the chart never mixes different scans.
  const runs = history.status === "ready" ? history.runs.filter((saved) => saved.source_filename === run.input.name) : [];

  // "Import scan" solves the file and opens the panel that shows its numbers.
  const importScan = (file: File) => {
    onUpload(file);
    const panel = document.getElementById(ALL_NUMBERS_ID) as HTMLDetailsElement | null;
    if (panel) {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Active study</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-medium tracking-tight">{FEMUR_MODEL.anatomy}</h2>
            <a href={FEMUR_MODEL.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-cyan/30 bg-cyan/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan hover:bg-cyan/20">
              {FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}
            </a>
          </div>
          <p className="mt-2 text-sm text-muted">
            CT scan from {FEMUR_AUTHORS}{FEMUR_INSTITUTION && `, ${FEMUR_INSTITUTION}`} · {FEMUR_MODEL.license} · research prototype, not a medical device
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".nii,.gz"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importScan(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={run.status === "loading"}
          className="flex w-fit items-center gap-2 rounded-lg bg-cyan px-4 py-2.5 text-xs font-semibold text-[#071318] transition hover:bg-[#75e5dd] disabled:opacity-60"
        >
          <FileUp size={15} /> Import scan
        </button>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <BoneViewer />
          {runs.length > 1 && <StressChart runs={runs} name={run.input.name} />}
        </div>
        <div className="min-w-0 space-y-5">
          <FractureRisk />
          <ClinicalMetrics />
          <PlainExplanation state={explanation} />
          <LiveRun run={run} history={history} onRunSample={onRunSample} onUpload={onUpload} />
        </div>
      </div>
    </div>
  );
}

const HEALTH = {
  checking: { label: "Checking the engine", detail: "Asking the simulation API whether it is up.", dot: "bg-muted", text: "text-muted" },
  online: { label: "Engine online", detail: "The simulation API answered its health check.", dot: "bg-cyan", text: "text-cyan" },
  // A browser cannot tell a server that is down from one that refuses this page's origin (CORS), so say only that.
  offline: { label: "Engine unreachable", detail: "This page cannot reach the simulation API.", dot: "bg-warning", text: "text-warning" },
} as const;

function ApiStatus({ health }: { health: ApiHealth }) {
  const state = HEALTH[health];
  return (
    <p role="status" title={`GET ${API_BASE_URL}/health, checked every 15 s`} className={`flex items-center gap-2 text-xs ${state.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} aria-hidden /> {state.label}
    </p>
  );
}

function NavItem({ active, icon, label, href }: { active?: boolean; icon: React.ReactNode; label: string; href?: string }) {
  const className = `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-[#15232b] text-cyan" : "text-muted hover:bg-panel hover:text-ink"}`;
  const content = <>{icon}<span>{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan" />}</>;
  return href ? <Link href={href} aria-current={active ? "page" : undefined} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}
