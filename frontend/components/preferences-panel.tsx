"use client";

import { useEffect, useState } from "react";
import { Activity, Check, Contrast, HardDrive, Monitor, Moon, Move, RotateCcw, Sun, Type } from "lucide-react";
import { DEFAULT_PREFERENCES, canStorePreferences, resetPreferences, savePreferences, usePreferences, type Preferences } from "@/lib/preferences";

const THEMES = [
  { value: "light", label: "Light", description: "Warm whites and navy accents.", icon: Sun },
  { value: "dark", label: "Dark", description: "Deep navy with softer light text.", icon: Moon },
  { value: "high-contrast", label: "High contrast", description: "Strong borders and darker text.", icon: Contrast },
  { value: "system", label: "System", description: "Follow your device’s light or dark appearance.", icon: Monitor },
] as const;
const TEXT_SIZES = [{ value: "standard", label: "Standard" }, { value: "large", label: "Large" }] as const;
const MOTION = [{ value: "system", label: "System" }, { value: "always", label: "Always reduce" }] as const;

export function PreferencesPanel() {
  const preferences = usePreferences();
  const [stored, setStored] = useState<boolean | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => setStored(canStorePreferences()), []);

  function change(patch: Partial<Preferences>, message: string) {
    setStored(savePreferences({ ...preferences, ...patch }));
    setAnnouncement(message);
  }
  const isDefault = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).every(key => preferences[key] === DEFAULT_PREFERENCES[key]);

  return (
    <div id="preferences-content" tabIndex={-1} className="preferences-page mx-auto max-w-[1440px] p-5 md:p-8">
      <header className="max-w-[68ch]">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">Make yourself comfortable</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight text-ink">Preferences</h1>
        <p className="mt-3 text-sm leading-relaxed text-body">Choose an appearance that works for you. Changes apply immediately and stay in this browser.</p>
      </header>

      <div className="mt-7 grid max-w-[960px] gap-6">
        <section aria-labelledby="appearance-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <h2 id="appearance-title" className="text-lg font-semibold text-ink">Appearance</h2>
          <p id="theme-description" className="mt-1 text-sm leading-relaxed text-body">Choose a color theme. Imaging colors and their scientific meaning stay the same.</p>
          <fieldset aria-describedby="theme-description" className="mt-5 min-w-0">
            <legend className="sr-only">Color theme</legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {THEMES.map(({ value, label, description, icon: Icon }) => {
                const checked = preferences.theme === value;
                return <label key={value} className={`theme-option relative flex min-w-0 cursor-pointer flex-col rounded-xl border-2 p-3 transition-colors ${checked ? "border-link bg-sunken" : "border-[rgb(var(--control))] bg-surface hover:bg-sunken"}`}>
                  <div data-theme-preview={value} className="theme-preview mb-3 flex h-20 overflow-hidden rounded-md border" aria-hidden="true">
                    <div className="theme-preview-nav w-6 shrink-0" />
                    <div className="flex flex-1 flex-col gap-2 p-3"><div className="theme-preview-title h-1.5 w-3/5 rounded" /><div className="theme-preview-card flex-1 rounded border p-2"><div className="theme-preview-line h-1 w-4/5 rounded" /><div className="theme-preview-line mt-2 h-1 w-3/5 rounded" /></div></div>
                  </div>
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <input type="radio" name="color-theme" value={value} checked={checked} onChange={() => change({ theme: value }, `${label} theme selected.`)} aria-labelledby={`theme-${value}-label`} aria-describedby={`theme-${value}-description`} className="h-5 w-5 shrink-0 accent-[rgb(var(--link))]" />
                    <Icon size={16} aria-hidden="true" /><span id={`theme-${value}-label`}>{label}</span>
                    {checked && <Check size={16} className="ml-auto text-link" aria-hidden="true" />}
                  </span>
                  <span id={`theme-${value}-description`} className="mt-2 text-xs leading-relaxed text-body">{description}</span>
                </label>;
              })}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="display-title" className="rounded-2xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-4 sm:px-6"><h2 id="display-title" className="text-lg font-semibold text-ink">Reading &amp; motion</h2><p className="mt-1 text-sm text-body">Adjust text and automatic movement.</p></div>
          <div className="divide-y divide-line">
            <Setting id="text-size" icon={<Type size={17} />} title="Text size" description="Large increases interface text and spacing. You can also use your browser’s zoom controls."
              control={<Segmented name="text-size" label="Text size" options={TEXT_SIZES} value={preferences.textSize} onChange={textSize => change({ textSize }, `${textSize === "large" ? "Large" : "Standard"} text selected.`)} />} />
            <Setting id="reduce-motion" icon={<Move size={17} />} title="Reduce motion" description="System follows your device. Always reduce limits interface animations and automatic scan motion. You can still rotate models and play simulations."
              control={<Segmented name="reduce-motion" label="Reduce motion" options={MOTION} value={preferences.reduceMotion} onChange={reduceMotion => change({ reduceMotion }, reduceMotion === "always" ? "Reduced motion enabled." : "Motion follows your device.")} />} />
          </div>
        </section>

        <section aria-labelledby="overview-title" className="rounded-2xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-4 sm:px-6"><h2 id="overview-title" className="text-lg font-semibold text-ink">Patient overview</h2><p className="mt-1 text-sm text-body">Choose when the demo engine runs.</p></div>
          <Setting id="auto-run" icon={<Activity size={17} />} title="Run the sample automatically" description="Run the small synthetic test when the patient overview opens. Turn this off to start it yourself with “Run the sample”."
            control={<button type="button" role="switch" aria-checked={preferences.autoRunSample} aria-labelledby="auto-run-title" aria-describedby="auto-run-description" onClick={() => change({ autoRunSample: !preferences.autoRunSample }, `Automatic sample run ${preferences.autoRunSample ? "off" : "on"}.`)} className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-[rgb(var(--control))] px-3 py-2 text-sm font-medium text-ink">
              <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[rgb(var(--control))] ${preferences.autoRunSample ? "bg-primary" : "bg-sunken"}`}><span className={`absolute left-0.5 h-4 w-4 rounded-full transition-transform ${preferences.autoRunSample ? "translate-x-5 bg-white" : "translate-x-0 bg-muted"}`} /></span>
              <span className="w-6">{preferences.autoRunSample ? "On" : "Off"}</span>
            </button>} />
        </section>

        <footer className="space-y-4">
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-sunken px-5 py-4 sm:flex-row sm:items-center">
            <div role="status" aria-live="polite" aria-atomic="true" className="flex min-w-0 gap-2 text-sm leading-relaxed text-body">
              <HardDrive size={18} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
              <p>{announcement && <span className="font-medium text-ink">{announcement} </span>}{stored === null ? "Checking browser storage…" : stored ? "Saved on this device only. These preferences are not sent to a server." : "Not saved: this browser blocks storage. Your changes work until this page reloads."}</p>
            </div>
            <button type="button" aria-disabled={isDefault} onClick={() => { if (!isDefault) { setStored(resetPreferences()); setAnnouncement("Default preferences restored."); } }} className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-lg border border-[rgb(var(--control))] bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas aria-disabled:cursor-default aria-disabled:opacity-60"><RotateCcw size={16} aria-hidden="true" />Reset to defaults</button>
          </div>
          <p className="text-xs leading-relaxed text-muted">Keyboard: Tab moves between settings; arrow keys change a theme or text option; Space toggles the sample run. Your browser’s zoom and device accessibility settings remain available.</p>
        </footer>
      </div>
    </div>
  );
}

function Setting({ id, icon, title, description, control }: { id: string; icon: React.ReactNode; title: string; description: string; control: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center">
    <div className="min-w-0 max-w-[50ch]"><h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-ink"><span aria-hidden="true" className="text-muted">{icon}</span>{title}</h3><p id={`${id}-description`} className="mt-2 text-sm leading-relaxed text-body">{description}</p></div>
    <div className="shrink-0">{control}</div>
  </div>;
}

function Segmented<T extends string>({ name, label, options, value, onChange }: { name: string; label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <fieldset aria-describedby={`${name}-description`} className="min-w-0"><legend className="sr-only">{label}</legend><div className="flex flex-wrap gap-2">
    {options.map(option => <label key={option.value} className={`theme-option inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${option.value === value ? "border-link bg-sunken text-ink" : "border-[rgb(var(--control))] bg-surface text-body"}`}><input type="radio" name={name} value={option.value} checked={option.value === value} onChange={() => onChange(option.value)} className="h-4 w-4 accent-[rgb(var(--link))]" />{option.label}</label>)}
  </div></fieldset>;
}
