// Shared with the pre-paint script; keep normalization independent of browser APIs.
export const PREFERENCES_KEY = "rainbone.preferences";
export const LARGE_TEXT_CLASS = "pref-text-large";
export const REDUCE_MOTION_CLASS = "pref-reduce-motion";

export function normalizePreferences(value: unknown): {
  textSize: "standard" | "large";
  reduceMotion: "system" | "always";
  autoRunSample: boolean;
  theme: "light" | "dark" | "high-contrast" | "system";
} {
  const saved = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    textSize: saved.textSize === "large" ? "large" as const : "standard" as const,
    reduceMotion: saved.reduceMotion === "always" ? "always" as const : "system" as const,
    autoRunSample: saved.autoRunSample !== false,
    theme: saved.theme === "dark" || saved.theme === "high-contrast" || saved.theme === "system"
      ? saved.theme : "light" as const,
  };
}

// A storage failure must still apply the light default. Use the same normalization
// as the runtime so legacy and corrupted values cannot cause a hydration flash.
export const PREFERENCES_SCRIPT = `(function(){var saved=null;try{saved=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_KEY)})||"null")}catch(e){}var p=(${normalizePreferences.toString()})(saved),root=document.documentElement;root.classList.toggle(${JSON.stringify(LARGE_TEXT_CLASS)},p.textSize==="large");root.classList.toggle(${JSON.stringify(REDUCE_MOTION_CLASS)},p.reduceMotion==="always");var dark=false;try{dark=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){}root.setAttribute("data-theme",p.theme==="system"?(dark?"dark":"light"):p.theme)})();`;
