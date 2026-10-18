"use client";

import { useEffect } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
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
import { LesionProgression } from "@/components/imaging-library";
import type { ClinicalMetrics as Metrics } from "@/lib/mock-data";
import { mockMetrics } from "@/lib/mock-data";
import { prefetchProgressionFrames } from "@/lib/progression-cache";
const PhysicsSimulations = dynamic(() => import("@/components/physics-simulations").then(module => module.PhysicsSimulations));

export function Dashboard({ metrics = mockMetrics, simulationStatus = "ready", view = "overview" }: { metrics?: Metrics; simulationStatus?: "loading" | "ready" | "error"; view?: "overview" | "physics" | "progression" }) {
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
            <NavItem active={view === "overview"} href="/" icon={<LayoutDashboard size={17} />} label="Patient overview" />
            <NavItem active={view === "physics"} href="/physics-simulations" icon={<Activity size={17} />} label="Physics simulations" />
            <NavItem icon={<FolderOpen size={17} />} label="Imaging library" />
            <NavItem active={view === "progression"} href="/lesion-progression" icon={<ScanLine size={17} />} label="Lesion progression" />
          </nav>
          <nav aria-label="Account" className="mt-8 space-y-1 px-3">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-nav-muted">Workspace</p>
            <NavItem icon={<ShieldCheck size={17} />} label="Secure datasets" />
            <NavItem icon={<Settings2 size={17} />} label="Preferences" />
          </nav>
          <div className="mt-auto p-4">
            <div className="rounded-xl border border-nav-line bg-white/[0.03] p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-nav-ink"><span className="h-2 w-2 rounded-full bg-spectrum-green" aria-hidden /> All services operational</p>
              <p className="mt-1.5 text-[11px] leading-4 text-nav-muted">Research prototype · not for clinical diagnosis</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-4 px-5 md:px-8">
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                <span className="lg:hidden"><RainboneMarkSmall /></span>
                <span className="hidden sm:inline">Patients</span>
                <ChevronRight size={14} className="hidden shrink-0 sm:block" aria-hidden />
                <span className="hidden sm:inline">RB-24081</span>
                <ChevronRight size={14} className="hidden shrink-0 sm:block" aria-hidden />
                <span className="truncate font-medium text-ink" aria-current="page">{view === "physics" ? "Physics simulations" : view === "progression" ? "Lesion progression" : "Patient overview"}</span>
              </nav>
              <div className="flex items-center gap-2">
                <IconButton label="Help"><CircleHelp size={18} /></IconButton>
                <IconButton label="Notifications"><Bell size={18} /></IconButton>
                <div className="ml-2 hidden items-center gap-3 border-l border-line pl-4 sm:flex">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">DR</div>
                  <div className="hidden text-left xl:block"><p className="text-[13px] font-medium leading-4 text-ink">Dr. Rowan</p><p className="text-[11px] text-muted">Radiology</p></div>
                  <ChevronDown size={14} className="text-muted" aria-hidden />
                </div>
              </div>
            </div>
            <nav aria-label="Mobile workspace navigation" className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 scrollbar-hide lg:hidden">
              <MobileNavItem active={view === "overview"} href="/" label="Patient overview" />
              <MobileNavItem active={view === "physics"} href="/physics-simulations" label="Physics simulations" />
              <MobileNavItem active={view === "progression"} href="/lesion-progression" label="Lesion progression" />
            </nav>
          </header>

          {view === "physics" ? <PhysicsSimulations /> : view === "progression" ? <LesionProgression /> : <div className="mx-auto max-w-[1440px] p-5 md:p-8">
            <PatientHeader />
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-6">
                <BoneViewer />
                <StressChart />
              </div>
              <ClinicalMetrics metrics={metrics} simulationStatus={simulationStatus} />
            </div>
            <p className="mt-8 border-t border-line pt-5 text-[11px] leading-5 text-muted">Rainbone is a research prototype. Simulations use assumed material properties and are not validated for clinical diagnosis or treatment decisions.</p>
          </div>}
        </section>
      </div>
    </main>
  );
}

function PatientHeader() {
  return (
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">Proximal femur — left</h1>
          <StatusPill />
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-body">
          <Meta icon={<UserRound size={14} />} label="Patient" value="RB-24081" mono />
          <Meta icon={<ScanLine size={14} />} label="Modality" value="CT · CT-ORG reference" />
          <Meta icon={<CalendarDays size={14} />} label="Acquired" value="12 Oct 2026" />
        </dl>
      </div>
      <button className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-white shadow-card transition hover:bg-primary-hover"><FileUp size={16} /> Import scan</button>
    </div>
  );
}

function StatusPill() {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-link/20 bg-link/[0.07] px-2.5 py-1 text-[12px] font-medium text-link"><span className="h-1.5 w-1.5 rounded-full bg-link" aria-hidden />In review</span>;
}

function Meta({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center gap-1.5"><span className="text-muted" aria-hidden>{icon}</span><dt className="sr-only">{label}</dt><dd className={mono ? "font-mono text-[12.5px]" : ""}>{value}</dd></div>;
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return <button className="rounded-lg p-2 text-muted transition hover:bg-sunken hover:text-ink" aria-label={label}>{children}</button>;
}

function RainboneMarkSmall() {
  return <span className="font-serif text-[15px] font-semibold text-ink">Rainbone</span>;
}

function NavItem({ active, icon, label, href }: { active?: boolean; icon: React.ReactNode; label: string; href?: string }) {
  const className = `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition ${active ? "bg-white/[0.08] font-medium text-nav-ink" : "text-nav-muted hover:bg-white/[0.04] hover:text-nav-ink"}`;
  const content = <>{active && <span className="spectrum-line-v absolute inset-y-2 left-0 w-[3px] rounded-full" aria-hidden />}{icon}<span>{label}</span></>;
  return href ? <Link href={href} aria-current={active ? "page" : undefined} className={className}>{content}</Link> : <div className={`${className} cursor-default`}>{content}</div>;
}

function MobileNavItem({ active, href, label }: { active?: boolean; href: string; label: string }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] ${active ? "bg-primary text-white" : "text-body hover:bg-sunken"}`}>{label}</Link>;
}
