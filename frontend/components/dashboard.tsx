"use client";

import { useEffect, useRef } from "react";
import {
  Activity,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  ScanLine,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { RainboneLogo } from "@/components/brand";
import { ClinicalMetrics } from "@/components/clinical-metrics";
import { StressChart } from "@/components/stress-chart";
import { BoneViewer } from "@/components/BoneViewer";
import { LiveRun, ALL_NUMBERS_ID } from "@/components/live-run";
import { PlainExplanation } from "@/components/plain-explanation";
import { FractureRiskAnalysis } from "@/components/risk-analysis";
import { LesionProgression } from "@/components/lesion-progression";
import { API_BASE_URL, type ExplanationState, type HistoryState, type RiskAnalysisState, type SimulationResult } from "@/lib/api";
import { FEMUR_AUTHORS, FEMUR_INSTITUTION, FEMUR_MODEL } from "@/lib/model";
import { REDUCE_MOTION_CLASS } from "@/lib/preferences-script";
import { prefetchProgressionFrames } from "@/lib/progression-cache";
const PhysicsSimulations = dynamic(() => import("@/components/physics-simulations").then(module => module.PhysicsSimulations));
const CloudBones = dynamic(() => import("@/components/CloudBones").then(module => module.CloudBones));
const SecureDatasets = dynamic(() => import("@/components/secure-datasets").then(module => module.SecureDatasets));
const PreferencesPanel = dynamic(() => import("@/components/preferences-panel").then(module => module.PreferencesPanel));

export type ApiHealth = "checking" | "online" | "offline";
export type RunInput = { name: string; kind: "sample" | "upload" };
export type RunState =
  | { status: "idle"; input: RunInput } // the automatic sample run is off in Preferences
  | { status: "loading"; input: RunInput }
  | { status: "ready"; input: RunInput; result: SimulationResult; ms: number }
  | { status: "error"; input: RunInput; message: string };

type OverviewProps = {
  view?: "overview";
  run: RunState;
  explanation: ExplanationState;
  risk: RiskAnalysisState;
  history: HistoryState;
  health: ApiHealth;
  onRunSample: () => void;
  onUpload: (file: File) => void;
};

// app/physics-simulations/page.tsx renders <Dashboard view="physics" />, app/bones/page.tsx <Dashboard view="imaging" />,
// app/lesion-progression/page.tsx <Dashboard view="progression" />, app/datasets/page.tsx <Dashboard view="datasets" />
// and app/preferences/page.tsx <Dashboard view="preferences" />.
type DashboardProps = OverviewProps | { view: "physics" | "imaging" | "progression" | "datasets" | "preferences" };

const VIEW_TITLES = {
  overview: "Patient overview",
  physics: "Physics simulations",
  imaging: "Imaging library",
  progression: "Lesion progression",
  datasets: "Secure datasets",
  preferences: "Preferences",
} as const;

const isWorkspaceView = (view: keyof typeof VIEW_TITLES) => view === "datasets" || view === "preferences";

export function Dashboard(props: DashboardProps) {
  const view = "run" in props ? "overview" : props.view;
  const health = "run" in props ? props.health : undefined;
  useEffect(() => {
    void prefetchProgressionFrames();
  }, []);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 flex-col bg-nav lg:flex">
          <div className="spectrum-line h-[3px]" aria-hidden />
          <div className="px-5 pb-2 pt-6"><RainboneLogo /></div>
          <nav aria-label="Workspace" className="mt-8 space-y-1 px-3">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-nav-muted">Analysis</p>
            <NavItem active={view === "overview"} href="/dashboard" icon={<LayoutDashboard size={17} />} label="Patient overview" />
            <NavItem active={view === "physics"} href="/physics-simulations" icon={<Activity size={17} />} label="Physics simulations" />
            <NavItem active={view === "imaging"} href="/bones" icon={<FolderOpen size={17} />} label="Imaging library" />
            <NavItem active={view === "progression"} href="/lesion-progression" icon={<ScanLine size={17} />} label="Lesion progression" />
          </nav>
          <nav aria-label="Account" className="mt-8 space-y-1 px-3">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-nav-muted">Workspace</p>
            <NavItem active={view === "datasets"} href="/datasets" icon={<ShieldCheck size={17} />} label="Secure datasets" />
            <NavItem active={view === "preferences"} href="/preferences" icon={<Settings2 size={17} />} label="Preferences" />
          </nav>
          <div className="mt-auto p-4">
            <div className="rounded-xl border border-nav-line bg-white/[0.03] p-4">
              {health ? <NavHealth health={health} /> : <p className="text-xs font-medium text-nav-ink">{view === "physics" ? "Physics simulation" : VIEW_TITLES[view]}</p>}
              <p className="mt-1.5 text-[11px] leading-4 text-nav-muted">Research prototype · not for clinical diagnosis</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-4 px-5 md:px-8">
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                <span className="lg:hidden"><RainboneMarkSmall /></span>
                <span className="hidden sm:inline">{isWorkspaceView(view) ? "Workspace" : "Patients"}</span>
                <ChevronRight size={14} className="hidden shrink-0 sm:block" aria-hidden />
                {!isWorkspaceView(view) && (
                  <>
                    <span className="hidden sm:inline">{view === "imaging" ? "CTPelvic1K" : `${FEMUR_MODEL.dataset} ${FEMUR_MODEL.caseId}`}</span>
                    <ChevronRight size={14} className="hidden shrink-0 sm:block" aria-hidden />
                  </>
                )}
                <span className="truncate font-medium text-ink" aria-current="page">{VIEW_TITLES[view]}</span>
              </nav>
              <div className="flex items-center gap-2">
                {health && <ApiStatus health={health} />}
                <IconButton label="Help"><CircleHelp size={18} /></IconButton>
                <IconButton label="Notifications"><Bell size={18} /></IconButton>
                <div className="ml-2 hidden items-center gap-3 border-l border-line pl-4 sm:flex" title="Demo account">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">DR</div>
                  <div className="hidden text-left xl:block"><p className="text-[13px] font-medium leading-4 text-ink">Dr. Rowan</p><p className="text-[11px] text-muted">Radiology · demo</p></div>
                  <ChevronDown size={14} className="text-muted" aria-hidden />
                </div>
              </div>
            </div>
            <nav aria-label="Mobile workspace navigation" className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 scrollbar-hide [mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%-20px),transparent)] lg:hidden">
              <MobileNavItem active={view === "overview"} href="/dashboard" label="Patient overview" />
              <MobileNavItem active={view === "physics"} href="/physics-simulations" label="Physics simulations" />
              <MobileNavItem active={view === "imaging"} href="/bones" label="Imaging library" />
              <MobileNavItem active={view === "progression"} href="/lesion-progression" label="Lesion progression" />
              <MobileNavItem active={view === "datasets"} href="/datasets" label="Secure datasets" />
              <MobileNavItem active={view === "preferences"} href="/preferences" label="Preferences" />
            </nav>
          </header>

          {"run" in props ? <Overview {...props} />
            : props.view === "physics" ? <PhysicsSimulations />
            : props.view === "progression" ? <LesionProgression />
            : props.view === "datasets" ? <SecureDatasets />
            : props.view === "preferences" ? <PreferencesPanel />
            : <div className="mx-auto max-w-[1440px] p-5 md:p-8"><CloudBones /></div>}
        </section>
      </div>
    </main>
  );
}

function Overview({ run, explanation, risk, history, onRunSample, onUpload }: OverviewProps) {
  // Saved runs of the same input as the live run, so the chart never mixes different scans.
  const runs = history.status === "ready" ? history.runs.filter((saved) => saved.source_filename === run.input.name) : [];

  // "Import scan" solves the file and opens the panel that shows its numbers.
  const importScan = (file: File) => {
    onUpload(file);
    const panel = document.getElementById(ALL_NUMBERS_ID) as HTMLDetailsElement | null;
    if (panel) {
      panel.open = true;
      const still = document.documentElement.classList.contains(REDUCE_MOTION_CLASS) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] p-5 md:p-8">
      <PatientHeader importing={run.status === "loading"} onImport={importScan} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <BoneViewer />
          {runs.length > 0 && <StressChart runs={runs} name={run.input.name} hourly={history.status === "ready" ? history.hourly : undefined} />}
        </div>
        <div className="min-w-0 space-y-6">
          <ClinicalMetrics />
          <FractureRiskAnalysis state={risk} />
          <PlainExplanation state={explanation} />
          <LiveRun run={run} history={history} onRunSample={onRunSample} onUpload={onUpload} />
        </div>
      </div>
      <p className="mt-8 border-t border-line pt-5 text-[11px] leading-5 text-muted">Rainbone is a research prototype. Simulations use assumed material properties and are not validated for clinical diagnosis or treatment decisions.</p>
    </div>
  );
}

function PatientHeader({ importing, onImport }: { importing: boolean; onImport: (file: File) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">{FEMUR_MODEL.anatomy}</h1>
          <a href={FEMUR_MODEL.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-link/20 bg-link/[0.07] px-2.5 py-1 text-[12px] font-medium text-link hover:bg-link/[0.12]"><span className="h-1.5 w-1.5 rounded-full bg-link" aria-hidden />{FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}</a>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-body">
          <Meta icon={<UserRound size={14} />} label="Patient" value={`${FEMUR_MODEL.dataset} ${FEMUR_MODEL.caseId}`} mono />
          <Meta icon={<ScanLine size={14} />} label="Modality" value={`CT · ${FEMUR_INSTITUTION || FEMUR_AUTHORS}`} />
          <Meta icon={<Database size={14} />} label="Source" value={`${FEMUR_AUTHORS} · ${FEMUR_MODEL.license}`} />
        </dl>
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
          if (file) onImport(file);
          event.target.value = "";
        }}
      />
      <button type="button" onClick={() => fileInput.current?.click()} disabled={importing} className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-white shadow-card transition hover:bg-primary-hover disabled:opacity-60"><FileUp size={16} /> Import scan</button>
    </div>
  );
}

function Meta({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center gap-1.5"><span className="text-muted" aria-hidden>{icon}</span><dt className="sr-only">{label}</dt><dd className={mono ? "font-mono text-[12.5px]" : ""}>{value}</dd></div>;
}

const HEALTH = {
  checking: { label: "Checking the engine", dot: "bg-muted", pill: "border-line bg-sunken text-muted", nav: "text-nav-muted" },
  online: { label: "Engine online", dot: "bg-success", pill: "border-success/25 bg-success/[0.07] text-success", nav: "text-nav-ink" },
  // A browser cannot tell a server that is down from one that refuses this page's origin (CORS), so say only that.
  offline: { label: "Engine unreachable", dot: "bg-caution", pill: "border-caution/25 bg-caution/[0.08] text-caution", nav: "text-nav-ink" },
} as const;

function ApiStatus({ health }: { health: ApiHealth }) {
  const state = HEALTH[health];
  return (
    <span role="status" title={`GET ${API_BASE_URL}/health, checked every 15 s`} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium ${state.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} aria-hidden /> {state.label}
    </span>
  );
}

function NavHealth({ health }: { health: ApiHealth }) {
  const state = HEALTH[health];
  return <p className={`flex items-center gap-2 text-xs font-medium ${state.nav}`}><span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden /> {state.label}</p>;
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return <button type="button" className="rounded-lg p-2 text-muted transition hover:bg-sunken hover:text-ink" aria-label={label}>{children}</button>;
}

function RainboneMarkSmall() {
  return <span className="font-serif text-[15px] font-semibold text-ink">Rainbone</span>;
}

function NavItem({ active, icon, label, href }: { active?: boolean; icon: React.ReactNode; label: string; href?: string }) {
  const className = `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition ${active ? "bg-white/[0.08] font-medium text-nav-ink" : "text-nav-muted hover:bg-white/[0.04] hover:text-nav-ink"}`;
  const content = <>{active && <span className="spectrum-line-v absolute inset-y-2 left-0 w-[3px] rounded-full" aria-hidden />}{icon}<span>{label}</span></>;
  return href ? <Link href={href} aria-current={active ? "page" : undefined} className={className}>{content}</Link> : <div className={`${className} cursor-default`}>{content}</div>;
}

// On a phone the strip scrolls sideways: bring the current page's item into view when it mounts. A module-level
// function, so React calls it once per mount and not on every re-render.
function scrollIntoStrip(link: HTMLAnchorElement | null) {
  const strip = link?.parentElement;
  if (link && strip) strip.scrollLeft += link.getBoundingClientRect().left - strip.getBoundingClientRect().left - 16;
}

function MobileNavItem({ active, href, label }: { active?: boolean; href: string; label: string }) {
  return <Link ref={active ? scrollIntoStrip : undefined} href={href} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] ${active ? "bg-primary text-white" : "text-body hover:bg-sunken"}`}>{label}</Link>;
}
