"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { HeaderPopover } from "@/components/header-popover";
import { FEMUR_MODEL } from "@/lib/model";

// One line per page, restating what each page's component does (dashboard.tsx lists the same routes).
const PAGES = [
  {
    href: "/dashboard",
    name: "Patient overview",
    text: `One published ${FEMUR_MODEL.dataset} femur in 3D with its solved stress and displacement, the AI fracture risk analysis of the study's data for that femur, and a live engine check. Import scan solves your own CT file (.nii or .nii.gz).`,
  },
  {
    href: "/physics-simulations",
    name: "Physics simulations",
    text: "The femur in a virtual press: play or step through a solved compression run and watch damage develop. Material and failure properties are assumed.",
  },
  {
    href: "/bones",
    name: "Imaging library",
    text: "Pelvic bone meshes from CTPelvic1K CT scans, loaded from private storage through short-lived signed links. Pick a case and show or hide each bone.",
  },
  {
    href: "/lesion-progression",
    name: "Lesion progression",
    text: "An illustrative transition between baseline and follow-up annotation locations. Its in-between frames and values are placeholders, not measurements.",
  },
  {
    href: "/datasets",
    name: "Secure datasets",
    text: "Where each dataset comes from, where it is kept, who can reach it and what happens to a scan you import.",
  },
  {
    href: "/preferences",
    name: "Preferences",
    text: "Text size, reduced motion and whether the overview runs the live engine check when it opens. Saved in this browser only.",
  },
] as const;

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-line-strong bg-sunken px-1 py-px font-mono text-[11px] text-ink">{children}</kbd>
);

export function HeaderHelp() {
  const pathname = usePathname();
  return (
    <HeaderPopover label="Help" title="About Rainbone" icon={<CircleHelp size={18} aria-hidden />}>
      <div className="space-y-5 px-5 py-4 text-[12.5px] leading-5 text-body">
        <p className="text-[13px] text-ink">Rainbone is a research prototype of a fall-fracture check from a hip CT. It is not a medical device.</p>

        <section aria-labelledby="help-pages">
          <h3 id="help-pages" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Pages</h3>
          <ul className="mt-2 space-y-2.5">
            {PAGES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} aria-current={pathname === page.href ? "page" : undefined} className="font-medium text-link hover:underline">{page.name}</Link>
                {pathname === page.href && <span className="ml-1.5 text-[11px] text-muted">(this page)</span>}
                <p className="mt-0.5">{page.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="help-data">
          <h3 id="help-data" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Where the data comes from</h3>
          <p className="mt-2">
            The femur and its fall-risk results come from the published {FEMUR_MODEL.dataset} study (case {FEMUR_MODEL.caseId}). The pelvic scans come from
            CTPelvic1K, segmented with TotalSegmentator. The live engine check sends a synthetic test volume. Every source, licence and storage place is
            on <Link href="/datasets" className="font-medium text-link hover:underline">Secure datasets</Link>.
          </p>
        </section>

        <section aria-labelledby="help-keys">
          <h3 id="help-keys" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Keyboard and mouse</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 marker:text-muted">
            <li><Key>Esc</Key> closes this panel.</li>
            <li>
              On the patient overview, in a window 1024 px or wider, <Key>Tab</Key> to the divider between the 3D view and the panels: <Key>←</Key> <Key>→</Key> move
              it (hold <Key>Shift</Key> for bigger steps), <Key>Home</Key> and <Key>End</Key> give the narrowest and widest panels, and <Key>Enter</Key> or
              a double-click restores the default width.
            </li>
            <li>In a 3D view: drag to rotate, scroll or pinch to zoom, <Key>Shift</Key> + drag to pan.</li>
            <li><Key>Esc</Key> also leaves a viewer&apos;s fullscreen.</li>
          </ul>
        </section>

        <Link href="/" className="inline-flex items-center gap-1.5 font-medium text-link hover:underline"><ArrowLeft size={14} aria-hidden /> Rainbone home page</Link>
      </div>
    </HeaderPopover>
  );
}
