import type { Metadata } from "next";
import Link from "next/link";
import manifest from "@/public/models/hfvalid-femur/manifest.json";
import { RainboneLogo } from "@/components/brand";
import { AccessPass } from "@/components/landing/access-pass";

export const metadata: Metadata = {
  title: "Enter · Rainbone",
  description: "Guest access to the Rainbone lab. No account, no email, no password.",
};

const FOCUS_DARK = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white";

export default function EnterPage() {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-viewport text-white">
      <div aria-hidden className="rb-glow-center pointer-events-none absolute inset-0" />
      <div aria-hidden className="rb-ct-grid rb-ct-grid-center pointer-events-none absolute inset-0" />
      <div aria-hidden className="rb-vignette pointer-events-none absolute inset-0" />
      <div aria-hidden className="spectrum-line rb-draw-x relative h-[2px]" />

      <header className="relative z-10 mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 lg:h-20 lg:px-12">
        <Link href="/" aria-label="Rainbone home" className={`rounded-lg ${FOCUS_DARK}`}><RainboneLogo tone="dark" size="xl" /></Link>
        <Link href="/" className={`rounded text-[13px] text-nav-muted transition hover:text-white ${FOCUS_DARK}`}>← Back to Rainbone</Link>
      </header>

      <div className="relative z-10 grid min-h-[calc(100svh-120px)] place-items-center px-4 py-8">
        <AccessPass maxMpa={manifest.metrics.max_nodal_von_mises_mpa} />
      </div>

      <footer className="relative z-10 pb-6 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-nav-muted">
        Research prototype · not a medical device
      </footer>
    </main>
  );
}
