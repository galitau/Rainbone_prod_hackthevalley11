// Shared by lib/preferences.ts and the inline script in app/layout.tsx. No React here: the root layout is a server
// component and imports PREFERENCES_SCRIPT from this file.

export const PREFERENCES_KEY = "rainbone.preferences";
export const LARGE_TEXT_CLASS = "pref-text-large";
export const REDUCE_MOTION_CLASS = "pref-reduce-motion";

// Runs before the first paint, so a saved "Large" or "Always reduce" never flashes the default first.
// Storage can be blocked (private windows, cleared site data); then the page keeps its defaults.
export const PREFERENCES_SCRIPT =
  `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_KEY)})||"{}"),c=document.documentElement.classList;` +
  `if(p.textSize==="large")c.add(${JSON.stringify(LARGE_TEXT_CLASS)});` +
  `if(p.reduceMotion==="always")c.add(${JSON.stringify(REDUCE_MOTION_CLASS)})}catch(e){}`;
