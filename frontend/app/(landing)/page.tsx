import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Box, Cloud, MessageSquareText } from "lucide-react";
import manifest from "@/public/models/hfvalid-femur/manifest.json";
import press from "@/public/models/femur-press/manifest.json";
import { RainboneLogo } from "@/components/brand";
import { EnterShortcut } from "@/components/landing/enter-shortcut";
import { ScanHero } from "@/components/landing/scan-hero";
import { REPLAY_SLOT_ID, STRESS_PROFILE_P95, SWEEP_UNDERLINE_ID, rampColor } from "@/components/landing/stress-profile";
import { ASSUMED_STRENGTH_MPA } from "@/lib/model";

export const metadata: Metadata = {
  title: "Rainbone | Watch a real femur carry 800 newtons",
  description: "Patient-specific bone stress from CT: a real femur solved with finite elements and painted with its stress.",
};

// Every number on this page comes from the two model manifests the dashboard loads (and lib/model for the index).
const m = manifest.metrics;
const fmt = (value: number) => value.toLocaleString("en-US");
const FACTS = {
  loadN: Math.round(m.load_newtons),
  elements: fmt(m.elements),
  nodes: fmt(m.nodes),
  maxNodal: m.max_nodal_von_mises_mpa.toFixed(2),
  maxElement: m.max_von_mises_mpa.toFixed(2),
  volume: m.volume_cm3.toFixed(2),
  lengthMm: Number((manifest.surface_bounds_ras_mm[5] - manifest.surface_bounds_ras_mm[4]).toFixed(0)),
  supportMm: m.support_depth_mm,
  youngsGpa: m.youngs_modulus_mpa / 1000,
  poisson: m.poisson_ratio,
  voxels: manifest.source_shape_ijk.join(" × "),
  spacing: `${manifest.source_spacing_mm[0].toFixed(2)} × ${manifest.source_spacing_mm[1].toFixed(2)} × ${manifest.source_spacing_mm[2].toFixed(1)}`,
  surfacePoints: fmt(manifest.surface_preparation.surface_points),
};
const pressLoads = press.frames.map(frame => frame.load_n);
const pressPeak = Math.max(...pressLoads);
const pressPeakFrame = pressLoads.indexOf(pressPeak);

const FOCUS_DARK = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white";
const KICKER = "font-mono text-[12px] uppercase tracking-[0.14em] text-link";
const H2 = "mt-3 font-serif text-[30px] font-semibold leading-tight tracking-[-0.015em] text-ink lg:text-[40px]";

export default function Landing() {
  return (
    <main className="bg-canvas text-ink">
      <EnterShortcut />
      <section aria-labelledby="hero-title" className="relative overflow-hidden bg-viewport text-white lg:h-[100svh] lg:max-h-[1000px] lg:min-h-[680px]">
        <div aria-hidden className="rb-glow pointer-events-none absolute inset-0" />
        <div aria-hidden className="rb-ct-grid pointer-events-none absolute inset-0" />
        <div aria-hidden className="rb-vignette pointer-events-none absolute inset-0" />
        <div aria-hidden className="spectrum-line rb-draw-x absolute inset-x-0 top-0 h-[2px]" />

        <header className="relative z-20 mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 lg:h-20 lg:px-12">
          <Link href="/" aria-label="Rainbone home" className={`rounded-lg ${FOCUS_DARK}`}><RainboneLogo tone="dark" size="xl" /></Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-viewport-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-nav-muted lg:inline-flex">Research prototype · not a medical device</span>
            <Link href="/enter" className={`inline-flex h-9 items-center rounded-lg border border-nav-line px-4 text-[13px] font-medium text-nav-ink transition hover:bg-white/5 ${FOCUS_DARK}`}>Enter</Link>
          </div>
        </header>

        {/* No positioned ancestors here: on desktop the hero frame is absolute to the section. */}
        <div className="rb-hero-column mx-auto max-w-[1440px] px-4 pb-10 pt-6 lg:flex lg:h-[calc(100%-80px)] lg:flex-col lg:px-12 lg:pb-0 lg:pt-0">
          <div className="lg:max-w-[min(760px,calc(52vw-40px))]">
            <p className="rb-rise relative z-10 font-mono text-[11px] uppercase tracking-[0.14em] text-spectrum-cyan lg:text-[12px]">CT scan → finite elements → stress</p>
            <h1 id="hero-title" className="relative z-10 mt-4 font-serif text-[36px] font-semibold leading-[1.02] tracking-[-0.02em] text-white lg:mt-5 lg:text-[clamp(44px,min(5.2vw,9vh),84px)] lg:leading-[0.95] lg:tracking-[-0.025em]">
              <span className="rb-rise block" style={{ animationDelay: "100ms" }}>Watch a real femur</span>
              <span className="rb-rise block" style={{ animationDelay: "180ms" }}>
                carry{" "}
                <span className="whitespace-nowrap">
                  <span className="relative inline-block">
                    {FACTS.loadN} newtons
                    <span id={SWEEP_UNDERLINE_ID} aria-hidden className="rb-underline spectrum-line absolute -bottom-[0.06em] left-0 right-0 h-[3px] origin-left rounded-full" />
                  </span>
                  .
                </span>
              </span>
            </h1>

            <ScanHero maxMpa={m.max_nodal_von_mises_mpa} loadN={FACTS.loadN} lengthMm={FACTS.lengthMm} />

            <p className="rb-rise relative z-10 mt-5 max-w-[52ch] text-[16px] leading-[1.6] text-viewport-ink lg:mt-6 lg:text-[18px]" style={{ animationDelay: "300ms" }}>
              A complete right femur from a real CT ({manifest.dataset} {manifest.case_id}), meshed into {FACTS.elements} tetrahedra and solved offline with {m.solver} under {FACTS.loadN}&nbsp;N on the hip. The colours are its computed von Mises stress, rendered live in your browser. Then the lab explains the result in plain words.
            </p>

            <div className="rb-rise relative z-10 mt-6 flex flex-col gap-4 lg:mt-9 lg:flex-row lg:items-center lg:gap-6" style={{ animationDelay: "380ms" }}>
              <Link
                href="/enter"
                className={`group relative inline-flex h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-white px-6 text-[16px] font-semibold text-[#14212e] shadow-[0_12px_40px_-12px_rgb(var(--spectrum-cyan)/0.55)] transition hover:bg-white/95 lg:h-14 lg:w-auto lg:min-w-[232px] ${FOCUS_DARK}`}
              >
                Enter the lab
                <kbd aria-hidden className="rounded-md border border-line px-1.5 font-mono text-[12px] font-normal text-muted">↵</kbd>
                <span aria-hidden className="spectrum-line absolute -bottom-2 left-4 right-4 h-[2px] origin-left scale-x-0 rounded-full transition-transform duration-200 group-hover:scale-x-100 group-focus-visible:scale-x-100" />
              </Link>
              <div className="flex items-center justify-center gap-6 lg:justify-start">
                <a href="#how" className={`rounded text-[15px] text-nav-muted transition hover:text-white ${FOCUS_DARK}`}>How it works ↓</a>
                <span className="hidden font-mono text-[12px] text-viewport-ink/60 lg:inline [@media(hover:none)]:hidden">or press ↵</span>
              </div>
            </div>
            {/* Desktop: the hero's Replay button is portalled here, so it comes after the CTA in tab order but sits in the frame's corner. */}
            <div id={REPLAY_SLOT_ID} className="hidden lg:absolute lg:bottom-10 lg:right-[calc(max(0px,(100vw-1440px)/2)+40px)] lg:z-10 lg:block" />

            <ul className="rb-rise relative z-10 mt-8 grid max-w-[640px] grid-cols-1 divide-y divide-viewport-line border-y border-viewport-line lg:mt-12 lg:grid-cols-3 lg:divide-x lg:divide-y-0" style={{ animationDelay: "460ms" }}>
              <Fact value={`${FACTS.loadN}\u00a0N`} label="on the femoral head" first />
              <Fact value={FACTS.elements} label={`tetrahedra · ${FACTS.nodes}\u00a0nodes`} />
              <Fact value={`0–${FACTS.maxNodal}\u00a0MPa`} label="nodal von Mises scale" />
            </ul>

            <p className="relative z-10 mt-6 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.12em] text-nav-muted lg:mt-8 lg:text-[11px]">
              Research prototype · not a medical device<span className="lg:max-xl:hidden"> · solved offline with assumed material</span>
            </p>
          </div>
        </div>
      </section>
      <div aria-hidden className="spectrum-line h-[2px]" />

      <section id="what" aria-labelledby="what-title" className="mx-auto max-w-[1200px] px-4 py-16 lg:px-12 lg:py-24">
        <p className={KICKER}>What it does</p>
        <h2 id="what-title" className={H2}>One bone, read three ways.</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <article className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div aria-hidden className="flex h-[136px] flex-col justify-end rounded-xl bg-viewport px-4 pb-3 pt-4">
              <div className="flex h-16 items-end gap-[2px]">
                {STRESS_PROFILE_P95.map((value, i) => (
                  <span key={i} className="flex-1 rounded-t-[1px]" style={{ height: `${Math.max(2, (value / m.max_nodal_von_mises_mpa) * 64)}px`, background: rampColor(value / m.max_nodal_von_mises_mpa) }} />
                ))}
              </div>
              <p className="mt-2 flex justify-between font-mono text-[10px] text-nav-muted"><span>knee</span><span>σ p95 by height · 0–{FACTS.maxNodal} MPa</span><span>head</span></p>
            </div>
            <h3 className="mt-5 flex items-center gap-2 text-[17px] font-semibold text-ink"><Box size={18} className="text-link" aria-hidden /> Stress map</h3>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed text-body">
              The complete right femur under {FACTS.loadN}&nbsp;N on the head, coloured from 0 to {FACTS.maxNodal}&nbsp;MPa. Rotate it, cut it open and read the stress on the cut face. Its peak against an assumed {ASSUMED_STRENGTH_MPA}&nbsp;MPa bone strength gives a fracture risk index: a research number, not a diagnosis.
            </p>
            <Link href="/enter" className="mt-4 w-fit rounded text-[15px] font-medium text-link hover:underline">Open the stress map →</Link>
          </article>
          <article className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div aria-hidden className="flex h-[136px] flex-col justify-end rounded-xl bg-viewport px-4 pb-3 pt-4">
              <PressCurve loads={pressLoads} peak={pressPeak} peakFrame={pressPeakFrame} />
              <p className="mt-2 flex flex-wrap justify-between gap-x-3 font-mono text-[10px] text-nav-muted"><span>force by frame</span><span className="text-viewport-ink">peak {fmt(Math.round(pressPeak))}&nbsp;N · frame {String(pressPeakFrame).padStart(2, "0")}</span></p>
            </div>
            <h3 className="mt-5 flex items-center gap-2 text-[17px] font-semibold text-ink"><Activity size={18} className="text-link" aria-hidden /> Press test</h3>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed text-body">
              A virtual press loads the same femur over {pressLoads.length} solved frames. The force peaks at {fmt(Math.round(pressPeak))}&nbsp;N, then falls as elements pass an assumed strain limit.
            </p>
            <Link href="/physics-simulations" className="mt-4 w-fit rounded text-[15px] font-medium text-link hover:underline">Open physics simulations →</Link>
          </article>
          <article className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div aria-hidden className="flex h-[136px] flex-col justify-end rounded-xl bg-viewport px-4 pb-3 pt-4">
              <div className="flex h-16 flex-wrap content-end gap-1.5">
                {[`${FACTS.loadN}\u00a0N`, `${FACTS.maxNodal}\u00a0MPa`, `${FACTS.youngsGpa}\u00a0GPa`, `${FACTS.volume}\u00a0cm³`].map(value => (
                  <span key={value} className="rounded-md border border-viewport-line bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-white">{value}</span>
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] text-nav-muted">solved values the text is checked against</p>
            </div>
            <h3 className="mt-5 flex items-center gap-2 text-[17px] font-semibold text-ink"><MessageSquareText size={18} className="text-link" aria-hidden /> In plain words</h3>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed text-body">
              Next to the 3D view, the lab explains the femur&apos;s results in plain words, and every number in that text is checked against the solved values.
            </p>
            <Link href="/enter" className="mt-4 w-fit rounded text-[15px] font-medium text-link hover:underline">Read it in the lab →</Link>
          </article>
        </div>

        <p className={`${KICKER} mt-14`}>Also in the lab</p>
        <article className="mt-4 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card lg:flex-row lg:items-center lg:gap-8">
          <div aria-hidden className="rounded-xl bg-viewport px-4 py-5 lg:w-[520px] lg:shrink-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-[11px] text-white">
              {["CTPelvic1K CT", "TotalSegmentator", "Vultr Object Storage", "pre-signed link", "your browser"].map((step, i, steps) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="whitespace-nowrap rounded-md border border-viewport-line bg-white/[0.03] px-2 py-1">{step}</span>
                  {i < steps.length - 1 && <span className="text-nav-muted">→</span>}
                </span>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] text-nav-muted">pelvic bone meshes · private bucket</p>
          </div>
          <div className="flex flex-1 flex-col">
            <h3 className="flex items-center gap-2 text-[17px] font-semibold text-ink"><Cloud size={18} className="text-link" aria-hidden /> Imaging library</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-body">
              Pelvic bones segmented by TotalSegmentator from CTPelvic1K CT scans, kept in a private Vultr Object Storage bucket. The browser downloads each mesh through a pre-signed link that the API issues.
            </p>
            <Link href="/bones" className="mt-4 w-fit rounded text-[15px] font-medium text-link hover:underline">Open the imaging library →</Link>
          </div>
        </article>
      </section>

      <section id="how" aria-labelledby="how-title" className="scroll-mt-6 border-t border-line bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 py-16 lg:px-12 lg:py-24">
          <p className={KICKER}>How it works</p>
          <h2 id="how-title" className={H2}>From CT to stress, on a real pipeline.</h2>
          <div aria-hidden className="spectrum-line mt-10 hidden h-[2px] rounded-full lg:block" />
          <ol className="mt-8 grid gap-6 lg:mt-6 lg:grid-cols-5 lg:gap-5">
            <Step n="01" title="CT">{manifest.dataset} {manifest.case_id}: {FACTS.voxels} voxels at {FACTS.spacing}&nbsp;mm.</Step>
            <Step n="02" title="Surface">The dataset authors&apos; segmentation, exported as a closed surface in 3D Slicer {manifest.slicer_version} and decimated to {FACTS.surfacePoints} surface points.</Step>
            <Step n="03" title="Mesh">{manifest.mesher}: {FACTS.elements} tetrahedra, {FACTS.nodes} nodes, {FACTS.volume}&nbsp;cm³ of bone.</Step>
            <Step n="04" title="Solve">{m.solver} linear elasticity: distal {FACTS.supportMm}&nbsp;mm fixed, {FACTS.loadN}&nbsp;N on the femoral head, E&nbsp;=&nbsp;{FACTS.youngsGpa}&nbsp;GPa, ν&nbsp;=&nbsp;{FACTS.poisson} (assumed).</Step>
            <Step n="05" title="See">vtk.js paints nodal von Mises stress, 0–{FACTS.maxNodal}&nbsp;MPa, in your browser. The raw element peak, {FACTS.maxElement}&nbsp;MPa, stays in the downloadable mesh.</Step>
          </ol>
          <p className="mt-8 rounded-xl bg-sunken p-5 text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-body">Limits:</span> homogeneous, uncalibrated material; illustrative loads, not a full musculoskeletal model; no mesh-convergence study or clinical validation. The femur on this page was solved offline; the lab&apos;s live engine check solves a sample scan on the server. Nothing is solved in your browser.
          </p>
        </div>
      </section>

      <section id="data" aria-labelledby="data-title" className="border-t border-line">
        <div className="mx-auto max-w-[1200px] px-4 py-16 lg:px-12 lg:py-24">
          <p className={KICKER}>Data and credits</p>
          <h2 id="data-title" className={H2}>Built on open data.</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 lg:grid-cols-2">
            <Credit term="HFValid">
              A collection of calibrated CT scans of whole femurs. Aldieri, La Mattina, Szyszko, Baruffaldi, Viceconti (2025), University of Bologna.{" "}
              <a href={manifest.source_url} target="_blank" rel="noreferrer" className="rounded text-link hover:underline">DOI 10.6092/unibo/amsacta/8431</a> · {manifest.license}.
            </Credit>
            <Credit term="CTPelvic1K">
              Pelvic CT scans for the imaging library. Liu et al. (2021), IJCARS.{" "}
              <a href="https://doi.org/10.5281/zenodo.4588403" target="_blank" rel="noreferrer" className="rounded text-link hover:underline">DOI 10.5281/zenodo.4588403</a> · CC BY 4.0.
            </Credit>
            <Credit term="Tools">SfePy · {manifest.mesher} · 3D Slicer {manifest.slicer_version} · TotalSegmentator · vtk.js · Next.js</Credit>
            <Credit term="Team">Built at Hack the Valley 11 by Galit Tauber, Camila Rojas, Jisara Wuttikreekiat and Marco Anthony Ayuste.</Credit>
            <Credit term="Source">
              <a href="https://github.com/galitau/Rainbone_prod_hackthevalley11" target="_blank" rel="noreferrer" className="rounded text-link hover:underline">github.com/galitau/Rainbone_prod_hackthevalley11</a>
            </Credit>
          </dl>
          <Link href="/enter" className="mt-12 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-white shadow-raised transition hover:bg-primary-hover">Enter the lab →</Link>
        </div>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-8 text-[13px] text-muted lg:flex-row lg:items-center lg:justify-between lg:px-12">
            <p>Rainbone is a research prototype, not a medical device. No output is a clinical measurement.</p>
            <p className="font-mono text-[12px]">Hack the Valley 11</p>
          </div>
        </footer>
      </section>
    </main>
  );
}

function Fact({ value, label, first }: { value: string; label: string; first?: boolean }) {
  return (
    <li className={`flex items-baseline justify-between gap-4 py-3 lg:block lg:px-5 lg:py-4 ${first ? "lg:pl-0" : ""}`}>
      <p className="whitespace-nowrap font-mono text-[18px] tabular-nums text-white lg:text-[17px] xl:text-[20px]">{value}</p>
      <p className="text-right text-[12px] text-nav-muted lg:mt-1 lg:text-left">{label}</p>
    </li>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 lg:block">
      <p className="w-7 shrink-0 font-mono text-[12px] text-link lg:w-auto">{n}</p>
      <div className="lg:mt-3">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-body">{children}</p>
      </div>
    </li>
  );
}

function Credit({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-line pt-4">
      <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">{term}</dt>
      <dd className="mt-2 text-[15px] leading-relaxed text-body [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

// Press force for each solved frame of public/models/femur-press, peak marked. The line stretches; the marker does not.
function PressCurve({ loads, peak, peakFrame }: { loads: number[]; peak: number; peakFrame: number }) {
  const width = 300, height = 64, pad = 4;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (loads.length - 1);
  const y = (load: number) => height - pad - (Math.max(0, load) / peak) * (height - 2 * pad);
  const path = loads.map((load, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(load).toFixed(1)}`).join(" ");
  return (
    <div className="relative h-16">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="press-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="rgb(47 79 216)" />
            <stop offset="0.3" stopColor="rgb(18 160 196)" />
            <stop offset="0.5" stopColor="rgb(240 180 41)" />
            <stop offset="0.6" stopColor="rgb(217 65 43)" />
            <stop offset="1" stopColor="rgb(217 65 43)" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#press-stroke)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgb(255_255_255/0.15)]" style={{ left: `${(x(peakFrame) / width) * 100}%`, top: `${(y(peak) / height) * 100}%` }} />
    </div>
  );
}
