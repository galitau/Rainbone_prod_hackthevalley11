import type { Metadata } from "next";
import Link from "next/link";
import { RainboneLogo } from "@/components/brand";

export const metadata: Metadata = { title: "Page not found | Rainbone" };

const FOCUS_DARK = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white";

export default function NotFound() {
  return (
    <main className="relative min-h-[100svh] bg-viewport text-white">
      <div aria-hidden className="spectrum-line relative h-[2px]" />
      <header className="mx-auto flex h-14 max-w-[1440px] items-center px-4 lg:h-16 lg:px-12">
        <Link href="/" aria-label="Rainbone home" className={`rounded-lg ${FOCUS_DARK}`}><RainboneLogo tone="dark" /></Link>
      </header>
      <section className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-16 text-[15px] leading-7 text-viewport-ink">
        <h1 className="font-serif text-3xl font-semibold text-white">Page not found</h1>
        <p>There is no page at this address.</p>
        <p className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/dashboard" className={`rounded underline underline-offset-4 hover:text-white ${FOCUS_DARK}`}>Open the patient overview</Link>
          <Link href="/" className={`rounded underline underline-offset-4 hover:text-white ${FOCUS_DARK}`}>Back to Rainbone</Link>
        </p>
      </section>
    </main>
  );
}
