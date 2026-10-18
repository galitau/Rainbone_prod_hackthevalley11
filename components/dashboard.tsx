"use client";

import {
  Activity,
  Bell,
  ChevronDown,
  CircleHelp,
  FileUp,
  LayoutDashboard,
  PanelRight,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ClinicalMetrics } from "@/components/clinical-metrics";
import { StressChart } from "@/components/stress-chart";
import { BoneViewer } from "@/components/BoneViewer";
import type { ClinicalMetrics as Metrics } from "@/lib/mock-data";
import { mockMetrics } from "@/lib/mock-data";
const PhysicsSimulations = dynamic(() => import("@/components/physics-simulations").then(module => module.PhysicsSimulations));

export function Dashboard({ metrics = mockMetrics, simulationStatus = "ready", view = "overview" }: { metrics?: Metrics; simulationStatus?: "loading" | "ready" | "error"; view?: "overview" | "physics" }) {
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
          <div className="mt-10 px-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Workspace</p>
            <div className="mt-4 space-y-4 text-sm text-muted">
              <p className="flex items-center gap-3"><ShieldCheck size={16} /> Secure datasets</p>
              <p className="flex items-center gap-3"><Settings2 size={16} /> Preferences</p>
            </div>
          </div>
          <div className="mt-auto rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center gap-2 text-xs text-cyan"><span className="h-1.5 w-1.5 rounded-full bg-cyan" /> System nominal</div>
            <p className="mt-2 text-xs leading-5 text-muted">All simulation services are available.</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[76px] items-center justify-between border-b border-line px-5 md:px-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">Clinical workspace / 04</p>
              <h1 className="mt-1 text-lg font-medium tracking-tight text-ink">{view === "physics" ? "Physics simulations" : "Patient analysis"}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="hidden rounded-lg border border-line p-2 text-muted transition hover:border-muted hover:text-ink sm:block" aria-label="Help"><CircleHelp size={17} /></button>
              <button className="rounded-lg border border-line p-2 text-muted transition hover:border-muted hover:text-ink" aria-label="Notifications"><Bell size={17} /></button>
              <div className="ml-1 hidden items-center gap-3 border-l border-line pl-4 sm:flex">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet to-cyan p-[1px]"><div className="flex h-full w-full items-center justify-center rounded-full bg-panel text-xs">DR</div></div>
                <div className="hidden text-left xl:block"><p className="text-xs font-medium text-ink">Dr. Rowan</p><p className="font-mono text-[9px] text-muted">Radiology</p></div>
                <ChevronDown size={14} className="text-muted" />
              </div>
            </div>
          </header>
          <nav aria-label="Mobile workspace navigation" className="flex gap-2 border-b border-line px-5 py-3 lg:hidden">
            <NavItem active={view === "overview"} href="/" icon={<LayoutDashboard size={15} />} label="Overview" />
            <NavItem active={view === "physics"} href="/physics-simulations" icon={<Activity size={15} />} label="Physics simulations" />
          </nav>

          {view === "physics" ? <PhysicsSimulations /> : <div className="p-5 md:p-8">
            <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Active study</p><div className="mt-2 flex items-center gap-3"><h2 className="text-2xl font-medium tracking-tight">Proximal femur — left</h2><span className="rounded-full border border-cyan/30 bg-cyan/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan">In review</span></div><p className="mt-2 text-sm text-muted">RB-24081 · CT-ORG reference · 12 Oct 2026</p></div>
              <button className="flex w-fit items-center gap-2 rounded-lg bg-cyan px-4 py-2.5 text-xs font-semibold text-[#071318] transition hover:bg-[#75e5dd]"><FileUp size={15} /> Import scan</button>
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-5">
                <BoneViewer />
                <StressChart />
              </div>
              <ClinicalMetrics metrics={metrics} simulationStatus={simulationStatus} />
            </div>
          </div>}
        </section>
      </div>
    </main>
  );
}

function NavItem({ active, icon, label, href }: { active?: boolean; icon: React.ReactNode; label: string; href?: string }) {
  const className = `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-[#15232b] text-cyan" : "text-muted hover:bg-panel hover:text-ink"}`;
  const content = <>{icon}<span>{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan" />}</>;
  return href ? <Link href={href} aria-current={active ? "page" : undefined} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}
