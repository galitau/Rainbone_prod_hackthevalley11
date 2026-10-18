import { formatNumber } from "@/lib/format";
import { ASSUMED_STRENGTH_MPA, FEMUR_INDEX_PERCENT, FEMUR_MODEL } from "@/lib/model";

// The three headline numbers. They describe the femur in the viewer and come from its manifest, so they
// render without the API (offline, on a phone, or before the backend is deployed).
export function FemurFindings() {
  return (
    <section aria-labelledby="findings-title" className="rounded-2xl border border-line bg-panel shadow-card">
      <div className="px-5 pt-5">
        <h2 id="findings-title" className="text-base font-semibold tracking-tight">
          What the simulation found
        </h2>
        <p className="mt-1 text-caption text-muted">
          For the femur in the viewer, solved ahead of time in {FEMUR_MODEL.solver}.
        </p>
      </div>
      <dl className="mt-1 divide-y divide-line px-5 pb-1">
        <Metric
          label="Highest stress shown"
          value={formatNumber(FEMUR_MODEL.shownStressMpa, 1)}
          unit="MPa"
          meaning="The red end of the stress colours on the 3D model."
        >
          <div aria-hidden>
            <div className="h-2 rounded-full bg-rainbow-x" />
            <div className="mt-1 flex justify-between text-label tabular-nums text-muted">
              <span>0</span>
              <span>{formatNumber(FEMUR_MODEL.shownStressMpa, 1)} MPa</span>
            </div>
          </div>
        </Metric>
        <Metric
          label="Largest movement"
          value={formatNumber(FEMUR_MODEL.maxDisplacementMm, 1)}
          unit="mm"
          meaning="How far the most-moved point shifts under the load."
        />
        <Metric
          label="Stress vs. assumed strength"
          value={formatNumber(FEMUR_INDEX_PERCENT, 1)}
          unit="%"
          meaning={`Highest stress shown ÷ an assumed ${ASSUMED_STRENGTH_MPA} MPa bone strength. Illustrative, not a clinical risk.`}
        >
          <div aria-hidden>
            <div className="h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-muted/70">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(Math.max(FEMUR_INDEX_PERCENT, 0), 100)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-label tabular-nums text-muted">
              <span>0</span>
              <span>{ASSUMED_STRENGTH_MPA} MPa</span>
            </div>
          </div>
        </Metric>
      </dl>
    </section>
  );
}

function Metric({ label, value, unit, meaning, children }: {
  label: string;
  value: string;
  unit: string;
  meaning: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-3">
      <dt className="text-sm font-medium text-ink">{label}</dt>
      <dd className="whitespace-nowrap">
        <span className="text-metric font-semibold tabular-nums text-ink">{value}</span>
        <span className="ml-1 text-sm font-medium text-muted">{unit}</span>
      </dd>
      {children && <dd className="col-span-2 mt-2">{children}</dd>}
      <dd className="col-span-2 mt-1.5 text-caption text-muted">{meaning}</dd>
    </div>
  );
}
