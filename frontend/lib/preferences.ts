"use client";

// Display and behaviour preferences, saved per browser in localStorage: no account, no server.
// They act through two classes on <html> (app/globals.css), which the inline script in app/layout.tsx sets before
// the first paint; usePreferences() reads them, savePreferences() changes them, and <PreferencesSync /> follows
// changes made in another tab.

import { useEffect, useSyncExternalStore } from "react";
import { LARGE_TEXT_CLASS, PREFERENCES_KEY, REDUCE_MOTION_CLASS } from "@/lib/preferences-script";

export type Preferences = {
  textSize: "standard" | "large";
  reduceMotion: "system" | "always";
  // app/page.tsx sends the sample volume to the API when the overview opens.
  autoRunSample: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = { textSize: "standard", reduceMotion: "system", autoRunSample: true };

function parse(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const saved = JSON.parse(raw) as Partial<Record<keyof Preferences, unknown>> | null;
    return {
      textSize: saved?.textSize === "large" ? "large" : "standard",
      reduceMotion: saved?.reduceMotion === "always" ? "always" : "system",
      autoRunSample: saved?.autoRunSample !== false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

// Every storage access can throw (blocked site data, some private windows); then the defaults apply.
function readStored(): string | null {
  try {
    return window.localStorage.getItem(PREFERENCES_KEY);
  } catch {
    return null;
  }
}

let current: Preferences | null = null;
const listeners = new Set<() => void>();

// The preferences in effect: the last ones saved in this page, else the stored ones, else the defaults.
export function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  return (current ??= parse(readStored()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function applyPreferences(preferences: Preferences) {
  const classes = document.documentElement.classList;
  classes.toggle(LARGE_TEXT_CLASS, preferences.textSize === "large");
  classes.toggle(REDUCE_MOTION_CLASS, preferences.reduceMotion === "always");
}

function use(next: Preferences) {
  current = next;
  applyPreferences(next);
  listeners.forEach((listener) => listener());
}

// Applies the preferences at once; returns false when the browser would not store them (they then last until reload).
export function savePreferences(next: Preferences): boolean {
  use(next);
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function resetPreferences(): boolean {
  use(DEFAULT_PREFERENCES);
  try {
    window.localStorage.removeItem(PREFERENCES_KEY);
    return true;
  } catch {
    return false;
  }
}

// Whether this browser lets the page store anything at all.
export function canStorePreferences(): boolean {
  try {
    const probe = `${PREFERENCES_KEY}.probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// The server and the first client render use the defaults, so hydration matches; the saved values follow at once.
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, readPreferences, () => DEFAULT_PREFERENCES);
}

// Rendered once in app/layout.tsx: re-applies the classes (in case the inline script could not run) and picks up
// preferences changed in another tab.
export function PreferencesSync() {
  useEffect(() => {
    applyPreferences(readPreferences());
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY || event.key === null) use(parse(readStored()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
