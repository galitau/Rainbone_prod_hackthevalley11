"use client";

import { useEffect, useState } from "react";
import { Activity, HardDrive, Move, RotateCcw, Type } from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  canStorePreferences,
  resetPreferences,
  savePreferences,
  usePreferences,
  type Preferences,
} from "@/lib/preferences";

const TEXT_SIZES = [
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
] as const;

const MOTION = [
  { value: "system", label: "Follow this device" },
  { value: "always", label: "Always reduce" },
] as const;

export function PreferencesPanel() {
  const preferences = usePreferences();
  // null until the page has checked; false when the browser blocks storage (settings then last until reload).
  const [stored, setStored] = useState<boolean | null>(null);
  const systemReducesMotion = useSystemReducedMotion();

  useEffect(() => setStored(canStorePreferences()), []);

  const change = (patch: Partial<Preferences>) => setStored(savePreferences({ ...preferences, ...patch }));
  const isDefault = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).every((key) => preferences[key] === DEFAULT_PREFERENCES[key]);

  return (
    <div className="mx-auto max-w-[1440px] p-5 md:p-8">
      <div className="min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">Preferences</h1>
        <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-body">How Rainbone looks and behaves in this browser. Changes apply at once, on every page.</p>
      </div>

      <div className="mt-6 grid max-w-[880px] gap-6">
        <section aria-labelledby="display-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-4">
            <h2 id="display-title" className="text-[15px] font-semibold text-ink">Display</h2>
            <p className="mt-0.5 text-[12px] text-muted">Reading comfort</p>
          </div>
          <div className="divide-y divide-line">
            <Setting
              icon={<Type size={15} />}
              title="Text size"
              description="Large makes all text, and the spacing around it, 12.5% bigger."
              control={<Segmented name="text-size" label="Text size" options={TEXT_SIZES} value={preferences.textSize} onChange={(textSize) => change({ textSize })} />}
            />
            <Setting
              icon={<Move size={15} />}
              title="Reduce motion"
              description={
                <>
                  Always reduce turns off animations and transitions everywhere. Follow this device uses your system&apos;s setting
                  {systemReducesMotion !== null && <>, which currently {systemReducesMotion ? "reduces motion" : "allows motion"}</>}.
                </>
              }
              control={<Segmented name="reduce-motion" label="Reduce motion" options={MOTION} value={preferences.reduceMotion} onChange={(reduceMotion) => change({ reduceMotion })} />}
            />
          </div>
        </section>

        <section aria-labelledby="overview-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-4">
            <h2 id="overview-title" className="text-[15px] font-semibold text-ink">Patient overview</h2>
            <p className="mt-0.5 text-[12px] text-muted">Live engine check</p>
          </div>
          <Setting
            icon={<Activity size={15} />}
            title="Run the live engine check when the overview opens"
            description={
              <>
                Sends <span className="font-mono text-[11.5px] text-ink">sample_bone.nii.gz</span>, a small synthetic test volume, to the RainbowBone API on each visit and shows what comes back. When off, the overview waits until you press &ldquo;Run the sample&rdquo;.
              </>
            }
            control={<Switch label="Run the live engine check when the overview opens" checked={preferences.autoRunSample} onChange={(autoRunSample) => change({ autoRunSample })} />}
          />
        </section>

        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-sunken/60 px-5 py-4 sm:flex-row sm:items-center">
          <p className="flex gap-2 text-[12.5px] leading-5 text-body" role="status">
            <HardDrive size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            {stored === false ? (
              <span><strong className="font-medium text-caution">Not saved.</strong> This browser blocks site storage, so these settings last until you reload or close the page.</span>
            ) : (
              <span><strong className="font-medium text-ink">Saved on this device.</strong> Stored in this browser only: no account and nothing sent to a server.</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setStored(resetPreferences())}
            disabled={isDefault}
            className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink shadow-card transition hover:border-line-strong hover:bg-sunken disabled:pointer-events-none disabled:opacity-50"
          >
            <RotateCcw size={14} aria-hidden /> Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function Setting({ icon, title, description, control }: { icon: React.ReactNode; title: string; description: React.ReactNode; control: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 px-5 py-4 md:flex-row md:items-center">
      <div className="min-w-0 max-w-[52ch]">
        <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink"><span className="text-muted" aria-hidden>{icon}</span>{title}</p>
        <p className="mt-1 text-[12.5px] leading-5 text-body">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Segmented<T extends string>({ name, label, options, value, onChange }: { name: string; label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-lg border border-line bg-sunken p-1">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${checked ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}
            >
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 rounded-lg px-1 py-1 text-[13px] font-medium text-ink"
    >
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? "bg-primary" : "bg-line-strong"}`} aria-hidden>
        <span className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      <span className="w-6 text-left">{checked ? "On" : "Off"}</span>
    </button>
  );
}

// The operating system's reduced-motion setting, or null before the page has read it.
function useSystemReducedMotion(): boolean | null {
  const [reduces, setReduces] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduces(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduces;
}
