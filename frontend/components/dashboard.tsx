"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Activity,
  Bell,
  ChevronRight,
  CircleHelp,
  Database,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  LayoutPanelLeft,
  ScanLine,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AccountChip } from "@/components/account-chip";
import { RainboneLogo } from "@/components/brand";
import { ClinicalMetrics } from "@/components/clinical-metrics";
import { StressChart } from "@/components/stress-chart";
import { BoneViewer } from "@/components/BoneViewer";
import { LiveRun, UploadedResult } from "@/components/live-run";
import { PlainExplanation } from "@/components/plain-explanation";
import { FractureRiskAnalysis } from "@/components/risk-analysis";
import { LesionProgression } from "@/components/lesion-progression";
import { CollapsiblePanel, PanelSplitter, useOverviewLayout, type PanelId } from "@/components/overview-layout";
import { API_BASE_URL, type ExplanationState, type HistoryState, type RiskAnalysisState, type SimulationResult } from "@/lib/api";
import { FEMUR_AUTHORS, FEMUR_INSTITUTION, FEMUR_MODEL } from "@/lib/model";
import { matchingSimulationRuns } from "@/lib/simulation-history";
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
  // The patient overview, physics simulations and lesion progression fit the window from lg up: header, page header
  // and one row; no page scroll.
  const fit = view === "overview" || view === "physics" || view === "progression";

  return (
    <main className={`min-h-screen bg-canvas text-ink${fit ? " lg:flex lg:h-dvh lg:min-h-[640px] lg:flex-col lg:overflow-hidden" : ""}`}>
      {view === "preferences" && <a href="#preferences-content" className="skip-preferences">Skip to preferences</a>}
      <div className={`flex min-h-screen${fit ? " lg:min-h-0 lg:flex-1" : ""}`}>
        <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 flex-col bg-nav lg:flex">
          <div className="spectrum-line h-[3px]" aria-hidden />
          <div className="px-5 pb-2 pt-6"><Link href="/" aria-label="Rainbone home" className="inline-block rounded-lg"><RainboneLogo size="lg" /></Link></div>
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

        <section className={`min-w-0 flex-1${fit ? " lg:flex lg:min-h-0 lg:flex-col" : ""}`}>
          <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-4 px-5 md:px-8">
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                <Link href="/" aria-label="Rainbone home" className="rounded lg:hidden"><RainboneMarkSmall /></Link>
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
                <AccountChip />
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
  const result = run.status === "ready" ? run.result : undefined;
  const runs = matchingSimulationRuns(history, result, run.input.name);

  // Make the uploaded input visible immediately, even when the advanced panel
  // was collapsed. Completion is announced without moving focus a second time.
  useEffect(() => {
    if (run.input.kind === "upload" && run.status === "loading") {
      document.getElementById("uploaded-result-title")?.focus({ preventScroll: true });
      document.getElementById("uploaded-scan-result")?.scrollIntoView({ block: "nearest" });
    }
  }, [run.input.kind, run.status]);

  // From lg up: the femur viewer fills the row, a splitter sets the panel column's width, and the panels scroll
  // on their own and collapse to their header. Width and collapsed panels are remembered per browser.
  const layout = useOverviewLayout();
  const rowRef = useRef<HTMLDivElement>(null);
  // The same element on every render, so resizing the panels does not re-render the viewer (it follows its container).
  const viewer = useMemo(() => <BoneViewer />, []);
  const panel = (id: PanelId, title: string, card: React.ReactNode, className?: string) => (
    <CollapsiblePanel id={id} title={title} collapsed={layout.collapsed[id]} onCollapsedChange={collapsed => layout.setCollapsed(id, collapsed)} className={className}>{card}</CollapsiblePanel>
  );
  // Below lg the saved runs stay under the viewer, as before; from lg up they are the last panel.
  const stressChart = runs.length > 0 && <StressChart runs={runs} name={run.input.name} matchKind={result?.run_id ? "run" : "filename"} sample={run.input.kind === "sample"} hourly={history.status === "ready" ? history.hourly : undefined} />;

  return (
    <div className="mx-auto max-w-[1440px] p-5 md:p-8 lg:flex lg:min-h-0 lg:w-full lg:max-w-none lg:flex-1 lg:flex-col lg:px-6 lg:pb-3 lg:pt-4">
      <PatientHeader importing={run.status === "loading"} onImport={onUpload} onResetLayout={layout.reset} />
      <div ref={rowRef} style={{ "--panel-w": `${layout.panelWidth}px` } as React.CSSProperties} className="mt-6 grid gap-6 lg:mt-4 lg:flex lg:min-h-0 lg:flex-1 lg:gap-0">
        <div className="min-w-0 space-y-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:[&>section]:flex lg:[&>section]:min-h-0 lg:[&>section]:flex-1 lg:[&>section]:flex-col lg:[&>section]:overflow-y-auto lg:[&>section>div.relative]:min-h-[240px] lg:[&>section>div.relative+div>span]:min-w-48">
          {viewer}
          {stressChart && <div className="lg:hidden">{stressChart}</div>}
        </div>
        <PanelSplitter width={layout.panelWidth} rowRef={rowRef} onResize={layout.setPanelWidth} />
        <div id="overview-panels" className="flex min-w-0 flex-col gap-6 lg:min-h-0 lg:w-[var(--panel-w)] lg:max-w-[calc(100%-416px)] lg:shrink-0 lg:gap-4 lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1 lg:[&_#all-numbers]:scroll-mt-0">
          {run.input.kind === "upload" && <UploadedResult run={run} history={history} />}
          {panel("metrics", "Clinical metrics", <ClinicalMetrics />)}
          {panel("risk", "AI fracture risk analysis", <FractureRiskAnalysis state={risk} />)}
          {panel("plain", "In plain words", <PlainExplanation state={explanation} />)}
          {panel("numbers", "All numbers and method", <LiveRun run={run} history={history} onRunSample={onRunSample} onUpload={onUpload} />)}
          {stressChart && panel("history", "Saved simulation runs", stressChart, "hidden lg:block")}
        </div>
      </div>
      <p className="mt-8 border-t border-line pt-5 text-[11px] leading-5 text-muted lg:mt-3 lg:shrink-0 lg:border-t-0 lg:pt-0 lg:leading-4">Rainbone is a research prototype. Simulations use assumed material properties and are not validated for clinical diagnosis or treatment decisions.</p>
    </div>
  );
}

function PatientHeader({ importing, onImport, onResetLayout }: { importing: boolean; onImport: (file: File) => void; onResetLayout: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">{FEMUR_MODEL.anatomy}</h1>
          <a href={FEMUR_MODEL.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-link/20 bg-link/[0.07] px-2.5 py-1 text-[12px] font-medium text-link hover:bg-link/[0.12]"><span className="h-1.5 w-1.5 rounded-full bg-link" aria-hidden />{FEMUR_MODEL.dataset} {FEMUR_MODEL.caseId}</a>
        </div>
        <dl className="mt-3 lg:mt-1 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-body">
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
      <div className="flex w-fit shrink-0 items-center gap-2">
        <button type="button" onClick={onResetLayout} title="Restore the default panel width and panels" className="hidden items-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink lg:inline-flex"><LayoutPanelLeft size={16} aria-hidden /> Reset layout</button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-white shadow-card transition hover:bg-primary-hover disabled:opacity-60"><FileUp size={16} /> Import scan</button>
      </div>
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
