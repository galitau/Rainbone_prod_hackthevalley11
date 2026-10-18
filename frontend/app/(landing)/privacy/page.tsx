import type { Metadata } from "next";
import Link from "next/link";
import { RainboneLogo } from "@/components/brand";

export const metadata: Metadata = {
  title: "Privacy · Rainbone",
  description: "What Rainbone stores when you use the demo, sign in with Google, or run a simulation.",
};

const FOCUS_DARK = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white";

export default function PrivacyPage() {
  return (
    <main className="relative min-h-[100svh] bg-viewport text-white">
      <div aria-hidden className="spectrum-line relative h-[2px]" />
      <header className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 lg:h-20 lg:px-12">
        <Link href="/" aria-label="Rainbone home" className={`rounded-lg ${FOCUS_DARK}`}><RainboneLogo tone="dark" size="xl" /></Link>
        <Link href="/" className={`whitespace-nowrap rounded text-[13px] text-nav-muted transition hover:text-white ${FOCUS_DARK}`}>← Back to Rainbone</Link>
      </header>

      <article className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-8 text-[15px] leading-7 text-viewport-ink">
        <h1 className="font-serif text-3xl font-semibold text-white">Privacy</h1>
        <p>
          Rainbone is a research prototype built at Hack the Valley 11. It is not a medical device. This page says what it
          stores and where.
        </p>

        <h2 className="font-serif text-xl font-semibold text-white">Demo account (Dr. Rowan)</h2>
        <p>The demo account asks for nothing. No account, email or password is created.</p>

        <h2 className="font-serif text-xl font-semibold text-white">Sign in with Google</h2>
        <p>
          If you sign in with Google, Google gives this page your name, email address and profile photo. Rainbone keeps
          them only in your own browser (localStorage) to show your name and photo in the header. They are not sent to
          Rainbone&apos;s server. Signing out, or switching to the demo account, deletes them from your browser. Google&apos;s
          sign-in button sets its own <code className="font-mono text-[13px]">g_state</code> cookie on this site.
        </p>

        <h2 className="font-serif text-xl font-semibold text-white">Simulations and AI answers</h2>
        <p>
          When a scan is simulated, the server records the file name and the computed results (stress, stiffness, volume,
          load, mesh size and timing) in a database, so the history chart can show earlier runs. The uploaded file itself
          is processed in memory and not saved. Each AI explanation is logged by its endpoint, model, timing and
          fingerprints (SHA-256 hashes) of its input facts and its text. None of these records says who ran them.
        </p>

        <h2 className="font-serif text-xl font-semibold text-white">Data in the app</h2>
        <p>
          The scans and measurements shown come from published research datasets, listed with their licences on the{" "}
          <Link href="/datasets" className={`rounded underline underline-offset-4 hover:text-white ${FOCUS_DARK}`}>Secure datasets</Link> page.
        </p>

        <h2 className="font-serif text-xl font-semibold text-white">Contact</h2>
        <p>Questions: minifiguresgt@gmail.com.</p>
      </article>
    </main>
  );
}
