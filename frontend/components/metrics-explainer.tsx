"use client";

import { useEffect, useId, useRef } from "react";
import { Info, X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { ASSUMED_STRENGTH_MPA, FEMUR_AUTHORS, FEMUR_FALL_RISK, FEMUR_INDEX_PERCENT, FEMUR_INSTITUTION, FEMUR_MODEL } from "@/lib/model";
import risk from "@/public/models/hfvalid-risk.json";

// "What do these numbers mean?" for the Clinical metrics card: one entry per number the card shows, each saying what
// it is, this femur's value, how to read it and where it comes from. Every value is the card's own constant with the
// card's own formatting, so the two cannot disagree.

const percent = (value: number) => `${formatNumber(value, 1)} %`;

type Kind = "published" | "computed" | "derived" | "assumed";

const KINDS: Record<Kind, { label: string; chip: string }> = {
  published: { label: "Published data", chip: "border-success/25 bg-success/[0.07] text-success" },
  computed: { label: "Computed by Rainbone", chip: "border-link/25 bg-link/[0.07] text-link" },
  derived: { label: "Derived", chip: "border-spectrum-violet/25 bg-spectrum-violet/[0.07] text-spectrum-violet" },
  assumed: { label: "Assumed", chip: "border-caution/30 bg-caution/[0.08] text-caution" },
};

type Entry = { title: string; value: string; kinds: Kind[]; what: React.ReactNode; read: React.ReactNode; source: React.ReactNode };

const m = FEMUR_MODEL;
const r = FEMUR_FALL_RISK;
const subject = (risk.subjects as Record<string, { msf_newtons: number; fractured_within_followup: boolean }>)[m.caseId];
const strongestMsf = Math.max(...Object.values(risk.subjects as Record<string, { msf_newtons: number }>).map(s => s.msf_newtons));
const fallLow = risk.fall_force.low_newtons;
const fallHigh = risk.fall_force.high_newtons;
// The dataset README's own wording: "Each FE model was simulated 28 times…" and "…or fractured within 5 years."
const fallDirections = risk.source.msf_definition.match(/simulated (\d+) times/)?.[1];
const followUpYears = risk.source.follow_up.match(/within (\d+) years/)?.[1];
const fallForcePubmed = risk.fall_force.citation.match(/PubMed (\d+)/)?.[1];
const fallForceAuthors = risk.fall_force.citation.split(",")[0];
const fracturedRange = `${formatNumber(r.fracturedArf0Min, 1)}–${percent(r.fracturedArf0Max)}`;
const factorRange = `${formatNumber(r.factorOfRiskLow, 1)}–${formatNumber(r.factorOfRiskHigh, 1)}×`;
const newtons = (value: number) => `${formatNumber(value, 0)} N`;

const link = "font-medium text-link hover:underline";
const dataset = (
  <>
    <a href={r.doiUrl} target="_blank" rel="noreferrer" className={link}>{FEMUR_AUTHORS}</a>, {m.dataset} collection
    {FEMUR_INSTITUTION ? `, ${FEMUR_INSTITUTION}` : ""}, {r.license}, DOI {risk.source.doi}
  </>
);
const fallForceSource = fallForcePubmed
  ? <a href={`https://pubmed.ncbi.nlm.nih.gov/${fallForcePubmed}/`} target="_blank" rel="noreferrer" className={link}>{fallForceAuthors}</a>
  : fallForceAuthors;

const FRACTURE_ENTRIES: Entry[] = [
  {
    title: "Fracture risk (ARF0)",
    value: percent(r.arf0Percent),
    kinds: ["published"],
    what: <>The absolute risk of fracture at time&nbsp;0 (ARF0) that the study authors&apos; finite-element model, coupled with a model of falling, gives this femur. The large {Math.round(r.arf0Percent)}&nbsp;% is the same value rounded.</>,
    read: <>It is the study authors&apos; model estimate for this femur, for comparing it with the other femurs in the study. It is not a personal probability and not a prediction of whether she will fracture.</>,
    source: <>The {m.dataset} table: {dataset}. Rainbone shows it as published. The dataset README: &ldquo;{r.arf0Definition}&rdquo;</>,
  },
  {
    title: "Study range and median",
    value: `${percent(r.cohortArf0Min)} to ${percent(r.cohortArf0Max)} · median ${percent(r.cohortArf0Median)}`,
    kinds: ["published"],
    what: <>The lowest, highest and middle ARF0 among the {r.cohortN} women in the study. On the card&apos;s bar they are the two ends and the thin line; the dark marker is this femur.</>,
    read: <>This femur&apos;s {percent(r.arf0Percent)} sits {r.arf0Percent > r.cohortArf0Median ? "above" : r.arf0Percent < r.cohortArf0Median ? "below" : "at"} the study median.</>,
    source: <>The same published table; Rainbone sorts the {r.cohortN} values and takes the median.</>,
  },
  {
    title: `Higher than ${r.arf0HigherThan} of the ${r.cohortN} women`,
    value: `${r.arf0HigherThan} of ${r.cohortN}`,
    kinds: ["published"],
    what: <>How many women in the study have a lower ARF0 than this femur.</>,
    read: <>A rank within this one study of {r.cohortN} women, not against the general population.</>,
    source: <>Counted by Rainbone from the published table; nothing is modelled.</>,
  },
  {
    title: "Women who fractured",
    value: `${r.cohortFractured} of ${r.cohortN} · ARF0 ${fracturedRange}`,
    kinds: ["published"],
    what: (
      <>
        The study recorded who fractured during its follow-up{followUpYears ? ` (it included women alive at least ${followUpYears} years after the CT scan, or fractured within ${followUpYears} years)` : ""}.{" "}
        {r.cohortFractured} of the {r.cohortN} did; their ARF0 ran from {fracturedRange}, the hatched band on the bar.
        {subject ? ` ${m.caseId} is recorded as ${subject.fractured_within_followup ? "fractured" : "not fractured"} during follow-up.` : ""}
      </>
    ),
    read: <>{r.cohortFractured} of {r.cohortN} women fractured while the median ARF0 was {percent(r.cohortArf0Median)}, which is why ARF0 is read as a model estimate for comparing femurs and not as the chance that this woman fractures.</>,
    source: <>The study&apos;s follow-up records: {dataset}.</>,
  },
  {
    title: "Sideways fall load",
    value: `${factorRange} its strength`,
    kinds: ["derived"],
    what: (
      <>
        The peak impact force on the side of the hip in a sideways fall, {newtons(fallLow)} for a small woman to {newtons(fallHigh)} for a large one, divided by
        this femur&apos;s minimum sidefall strength (MSF) of {newtons(r.msfNewtons)}: the lowest force{fallDirections ? `, over ${fallDirections} simulated fall directions,` : ""} that
        the study authors&apos; model says would cause a fracture.
      </>
    ),
    read: (
      <>
        Above 1× the fall force is more than the modelled strength.
        {fallLow > strongestMsf ? ` The strongest MSF in the study, ${newtons(strongestMsf)}, is below ${newtons(fallLow)}, so every femur in the study is above 1×; the number says by how much.` : ""}{" "}
        It is a ratio of forces, not a probability.
      </>
    ),
    source: <>MSF: published, {dataset}. Fall forces: {fallForceSource}. Rainbone does the division.</>,
  },
];

const SIMULATION_ENTRIES: Entry[] = [
  {
    title: "Standing-load stress ratio",
    value: `${formatNumber(FEMUR_INDEX_PERCENT, 1)} %`,
    kinds: ["computed", "assumed"],
    what: <>The peak stress from Rainbone&apos;s standing-load simulation, {formatNumber(m.shownStressMpa, 1)}&nbsp;MPa, divided by an assumed bone strength of {ASSUMED_STRENGTH_MPA}&nbsp;MPa.</>,
    read: <>100&nbsp;% would mean the peak stress reaches the assumed strength. It is not a fracture probability and it does not model a fall.</>,
    source: <>Rainbone&apos;s own calculation; the {ASSUMED_STRENGTH_MPA}&nbsp;MPa strength is an assumption, the same one the Rainbone API divides by.</>,
  },
  {
    title: "Peak stress (nodal average)",
    value: `${formatNumber(m.shownStressMpa, 1)} MPa`,
    kinds: ["computed"],
    what: (
      <>
        The highest stress in Rainbone&apos;s {m.solver} finite-element solve of this femur: {newtons(m.loadNewtons)} pressing down on the femoral head, the lowest {m.supportDepthMm}&nbsp;mm
        at the knee end held fixed. Element stresses are averaged at each mesh node, and this is the top of the 3D colour scale; the single highest element before
        averaging is {formatNumber(m.elementStressMpa, 1)}&nbsp;MPa.
      </>
    ),
    read: <>Shows where standing load concentrates in this bone&apos;s shape. The material is assumed and uncalibrated, so read the size as approximate.</>,
    source: <>Rainbone&apos;s {m.solver} solve on a {formatNumber(m.elements, 0)}-element mesh of the dataset authors&apos; CT segmentation.</>,
  },
  {
    title: "Young’s modulus (assumed)",
    value: `${formatNumber(m.youngsModulusGpa, 1)} GPa`,
    kinds: ["assumed"],
    what: <>The stiffness the simulation gives the bone: one uniform value for the whole femur, with a Poisson&apos;s ratio of {m.poissonRatio}.</>,
    read: <>Assumed and uncalibrated, not measured from this CT, which is why the stress numbers are approximate. It plays no part in the published ARF0 or MSF.</>,
    source: <>A setting of Rainbone&apos;s simulation.</>,
  },
  {
    title: "Bone volume",
    value: `${formatNumber(m.volumeCm3, 1)} cm³`,
    kinds: ["computed"],
    what: <>The volume of the 3D mesh of this femur.</>,
    read: <>A size check on the model; it is not an input to any risk number on the card.</>,
    source: <>Rainbone&apos;s mesh of the dataset authors&apos; CT segmentation.</>,
  },
];

const LEGEND: { kind: Kind; text: React.ReactNode }[] = [
  { kind: "published", text: <>ARF0, MSF and who fractured, from the {m.dataset} study ({FEMUR_INSTITUTION || FEMUR_AUTHORS}, {r.license})</> },
  { kind: "computed", text: <>Peak stress, the stress ratio and bone volume, from our {m.solver} standing-load solve</> },
  { kind: "derived", text: <>The sideways-fall load: published fall forces ÷ this femur&apos;s published MSF</> },
  { kind: "assumed", text: <>The material: Young&apos;s modulus {formatNumber(m.youngsModulusGpa, 1)}&nbsp;GPa and strength {ASSUMED_STRENGTH_MPA}&nbsp;MPa</> },
];

function KindChip({ kind }: { kind: Kind }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${KINDS[kind].chip}`}>{KINDS[kind].label}</span>;
}

function EntryList({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section className="mt-5">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{title}</h3>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
        {entries.map(entry => (
          <li key={entry.title} className="px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className="text-[13.5px] font-semibold text-ink">{entry.title}</h4>
              <p className="font-mono text-[13.5px] font-medium text-ink tabular-nums" data-explainer-value>{entry.value}</p>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{entry.kinds.map(kind => <KindChip key={kind} kind={kind} />)}</div>
            <div className="mt-2 space-y-1.5 text-[12.5px] leading-5 text-body">
              <p><span className="font-medium text-ink">What it is. </span>{entry.what}</p>
              <p><span className="font-medium text-ink">How to read it. </span>{entry.read}</p>
              <p className="text-muted"><span className="font-medium">Where it comes from. </span>{entry.source}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The button on the card and the modal it opens. A native <dialog> opened with showModal() sits above the panel
// column (so the collapsible panel's own scrolling does not clip it), makes the rest of the page inert, and closes
// on Esc; Tab is kept inside it and focus goes back to the button on close. It is fitted to the visible area
// (visualViewport), not the layout viewport: when a page is wider than a phone screen the layout viewport grows past
// it, and a dialog sized to that would hang off the right and bottom edges.
export function MetricsExplainer() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pressedOnBackdrop = useRef(false);
  const id = useId();
  const titleId = `${id}-title`;
  const answerId = `${id}-answer`;

  const close = () => dialog.current?.close();

  const fitToVisibleArea = () => {
    const box = dialog.current;
    const visible = window.visualViewport;
    if (!box || !visible) return;
    const right = Math.max(0, window.innerWidth - visible.offsetLeft - visible.width);
    const bottom = Math.max(0, window.innerHeight - visible.offsetTop - visible.height);
    box.style.inset = `${visible.offsetTop}px ${right}px ${bottom}px ${visible.offsetLeft}px`;
    box.style.setProperty("--visible-w", `${visible.width}px`);
    box.style.setProperty("--visible-h", `${visible.height}px`);
  };

  const open = () => {
    fitToVisibleArea();
    dialog.current?.showModal();
  };

  // Phone toolbars, rotation and pinch-zoom move the visible area while the dialog is open.
  useEffect(() => {
    const visible = window.visualViewport;
    if (!visible) return;
    const refit = () => {
      if (dialog.current?.open) fitToVisibleArea();
    };
    visible.addEventListener("resize", refit);
    visible.addEventListener("scroll", refit);
    return () => {
      visible.removeEventListener("resize", refit);
      visible.removeEventListener("scroll", refit);
    };
  }, []);

  const keepTabInside = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={open}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-link/30 bg-link/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-link transition hover:border-link/50 hover:bg-link/[0.1] lg:[[data-collapsed=true]_&]:hidden"
      >
        <Info size={14} aria-hidden /> What do these numbers mean?
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={answerId}
        onClose={() => trigger.current?.focus()}
        onKeyDown={keepTabInside}
        // A click on the backdrop lands on the <dialog> itself; clicks on its content land on the inner frame. Both ends
        // of the click must be on the backdrop, so a text selection released outside does not close it.
        onPointerDown={event => { pressedOnBackdrop.current = event.target === event.currentTarget; }}
        onClick={event => { if (pressedOnBackdrop.current && event.target === event.currentTarget) close(); }}
        className="m-auto max-h-[calc(var(--visible-h,100dvh)-32px)] w-[calc(var(--visible-w,100%)-32px)] max-w-[680px] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-[rgb(20_33_46/0.45)]"
      >
        <div className="flex max-h-[calc(var(--visible-h,100dvh)-34px)] flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <h2 id={titleId} className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">What these numbers mean</h2>
              <p className="mt-0.5 text-[12px] text-muted">Clinical metrics · {m.dataset} {m.caseId}, {m.anatomy.toLowerCase()}</p>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition hover:border-line-strong hover:text-ink">
              <X size={16} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6">
            <div className="rounded-xl border border-line bg-sunken/60 px-4 py-3.5">
              <p id={answerId} className="text-[13.5px] leading-[1.35rem] text-ink">
                <span className="font-semibold">Is this real?</span> Partly: the fracture-risk numbers come from published research data on this real CT scan,
                while the stress numbers are Rainbone&apos;s own simulation with assumed material properties.
              </p>
              <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2 sm:gap-x-4">
                {LEGEND.map(item => (
                  <li key={item.kind} className="text-[12px] leading-6 text-body"><KindChip kind={item.kind} /> {item.text}</li>
                ))}
              </ul>
            </div>

            <EntryList title="Fracture risk · published fall model" entries={FRACTURE_ENTRIES} />
            <EntryList title={`Standing-load simulation · ${m.solver}`} entries={SIMULATION_ENTRIES} />

            <p className="mt-5 text-[12px] leading-5 text-muted">
              Which femur: {m.dataset} {m.caseId}, a {m.anatomy.toLowerCase()} from {dataset}. The 3D bone is the dataset authors&apos; own CT segmentation. Research data, not a diagnosis.
            </p>
          </div>

          <div className="flex shrink-0 justify-end border-t border-line px-5 py-3 sm:px-6">
            <button type="button" onClick={close} className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-sunken">Close</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
