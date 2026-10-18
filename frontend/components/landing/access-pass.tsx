"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { RainboneMark } from "@/components/brand";
import { STRESS_PROFILE_P95, rampColor } from "@/components/landing/stress-profile";

const FOCUS_DARK = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white";

// SEAT matches the demo clinician the dashboard header shows next.
const PASS_ROWS: [string, string][] = [
  ["SEAT", "Dr. Rowan · demo clinician"],
  ["ACCOUNT", "None"],
  ["STORED", "Nothing about you"],
  ["CASE", "HFValid Pat001 · right femur"],
  ["USE", "Research only · not a medical device"],
  ["EVENT", "Hack the Valley 11"],
];

/**
 * Demo access, not a login: there is no account, so the pass has no fields and sends nothing.
 * Entering plays a short scan across the card and then opens the dashboard (never held longer than 280 ms).
 */
export function AccessPass({ maxMpa }: { maxMpa: number }) {
  const router = useRouter();
  const enterRef = useRef<HTMLAnchorElement>(null);
  const busy = useRef(false);
  const [phase, setPhase] = useState<"ready" | "opening">("ready");

  useEffect(() => {
    router.prefetch("/dashboard");
    // autoFocus on an <a> only applies to server-rendered HTML; focus it after client navigations too.
    // Focusing scrolls it into view if a short screen puts it below the fold.
    enterRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy.current) router.push("/");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const enter = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("opening");
      return; // the Link navigates on its own
    }
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPhase("opening");
    window.setTimeout(() => router.push("/dashboard"), 280);
  };

  return (
    <div className="rb-card-in relative w-full max-w-[440px]">
      {/* Lanyard: a strap from above the fold down to a clip on the card. */}
      <div aria-hidden className="rb-ribbon pointer-events-none absolute bottom-full left-1/2 hidden h-[50vh] w-7 -translate-x-1/2 sm:block" />
      <div aria-hidden className="pointer-events-none absolute -top-2 left-1/2 z-10 hidden h-4 w-11 -translate-x-1/2 rounded-md border border-white/15 bg-[rgb(28_39_56)] shadow-[0_4px_10px_rgb(0_0_0/0.4)] sm:block" />
      <div data-phase={phase} className="rb-press relative overflow-hidden rounded-[20px] border border-viewport-line bg-white/[0.03] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)] backdrop-blur-sm">
        <div aria-hidden className="spectrum-line h-[3px]" />
        <div aria-hidden className="mx-auto mt-3 h-2 w-11 rounded-full border border-viewport-line bg-viewport" />

        <div className="px-7 pb-7">
          <div className="flex items-center gap-3 pt-4">
            <RainboneMark size={40} />
            <p className="font-serif text-[20px] font-semibold tracking-[-0.01em] text-white">Rainbone</p>
            <p className="ml-auto font-mono text-[11px] tracking-[0.14em] text-spectrum-cyan">DEMO PASS</p>
          </div>

          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-nav-muted">Reading room · guest access</p>
          <h1 id="pass-title" className="mt-2 font-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.015em] text-white sm:text-[40px]">Your pass is ready.</h1>
          <p id="pass-note" className="mt-3 text-[15px] leading-relaxed text-viewport-ink">
            Demo access: no account, no email, no password. The pass asks for nothing and stores nothing.
          </p>

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 font-mono text-[12px]">
            {PASS_ROWS.map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-nav-muted">{term}</dt>
                <dd className="text-white">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Decorative σ profile: dropped on short screens so the button stays above the fold. */}
          <div className="mt-5 [@media(max-height:820px)]:hidden">
            <div aria-hidden className="flex h-14 items-end gap-[2px]">
              {STRESS_PROFILE_P95.map((value, i) => (
                <span
                  key={i}
                  className="rb-bar flex-1 rounded-t-[1px]"
                  style={{ height: `${Math.max(2, (value / maxMpa) * 56)}px`, background: rampColor(value / maxMpa), animationDelay: `${200 + i * 8}ms` }}
                />
              ))}
            </div>
            <p className="mt-2 flex flex-wrap justify-between gap-x-3 font-mono text-[10px] text-nav-muted">
              <span>σ profile · knee → head</span>
              <span>HFValid Pat001 · 0–{maxMpa.toFixed(2)} MPa</span>
            </p>
          </div>

          <Link
            ref={enterRef}
            href="/dashboard"
            autoFocus
            aria-describedby="pass-title pass-note"
            onClick={enter}
            className={`mt-5 inline-flex h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-white text-[15px] font-semibold text-ink transition hover:bg-white/90 ${FOCUS_DARK}`}
          >
            Enter as guest
            <kbd aria-hidden className="rounded-md border border-line px-1.5 font-mono text-[12px] font-normal text-muted">↵</kbd>
          </Link>
          <p role="status" aria-live="polite" className={phase === "opening" ? "mt-2 text-center font-mono text-[11px] text-nav-muted" : "sr-only"}>
            {phase === "opening" ? "Opening the lab…" : ""}
          </p>

          <p className="mt-4 text-[12px] leading-relaxed text-nav-muted">
            Run history keeps each simulation&apos;s numbers and file name. No account, email or IP is stored with them.
          </p>

          <p className="mt-4 border-t border-viewport-line pt-4 font-mono text-[12px] text-nav-muted">
            Or jump to:{" "}
            <Link href="/dashboard" className={`whitespace-nowrap rounded text-viewport-ink underline-offset-4 hover:text-white hover:underline ${FOCUS_DARK}`}>Patient overview</Link>
            {" · "}
            <Link href="/physics-simulations" className={`whitespace-nowrap rounded text-viewport-ink underline-offset-4 hover:text-white hover:underline ${FOCUS_DARK}`}>Physics simulations</Link>
          </p>
        </div>

        {phase === "opening" && (
          <div aria-hidden className="rb-pass-scan pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-[rgb(var(--spectrum-cyan)/0.16)] to-transparent" />
            <div className="spectrum-line absolute inset-x-0 top-0 h-[2px] shadow-[0_0_18px_4px_rgb(var(--spectrum-cyan)/0.45)]" />
          </div>
        )}
      </div>
    </div>
  );
}
