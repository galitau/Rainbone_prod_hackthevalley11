// Optional "Sign in with Google" (Google Identity Services). Display-only and browser-only:
// the ID token is decoded in the browser for a name, email and photo, never verified and never
// sent to the Rainbone API. Unset NEXT_PUBLIC_GOOGLE_CLIENT_ID and the Google option is not shown.

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

const GSI_SRC = "https://accounts.google.com/gsi/client";
const STORAGE_KEY = "rainbone.google-identity";

export type GoogleIdentity = { name: string; email: string; picture: string };

type GsiButtonOptions = {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
};

type GsiId = {
  initialize(config: { client_id: string; callback: (response: { credential?: string }) => void }): void;
  renderButton(parent: HTMLElement, options: GsiButtonOptions): void;
  disableAutoSelect(): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

export function gsi(): GsiId | undefined {
  return typeof window === "undefined" ? undefined : window.google?.accounts?.id;
}

let loading: Promise<GsiId> | null = null;

/** Loads Google's client script once; rejects if it is blocked or offline. */
export function loadGsi(): Promise<GsiId> {
  const ready = gsi();
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise<GsiId>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => {
      const id = gsi();
      if (id) return resolve(id);
      script.remove();
      loading = null;
      reject(new Error("Google Identity Services did not start"));
    };
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error("Google Identity Services could not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

type CredentialHandler = (credential?: string) => void;

let onCredential: CredentialHandler | null = null;
let initialized = false;

/**
 * Initialises Google's client once per page load. Later mounts of the button (Back, or /enter after
 * signing out) only swap the handler, so Google never warns that initialize() was called twice.
 */
export function initGsi(id: GsiId, handler: CredentialHandler): void {
  onCredential = handler;
  if (initialized) return;
  id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (response) => onCredential?.(response.credential) });
  initialized = true;
}

/** Drops the handler of a button that unmounted, unless a newer button already replaced it. */
export function clearGsiHandler(handler: CredentialHandler): void {
  if (onCredential === handler) onCredential = null;
}

/** Reads name, email and picture from the ID token's payload. Decoded only, not verified: display use only. */
export function identityFromCredential(credential: string): GoogleIdentity | null {
  const part = credential.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    return toIdentity({ name: text(p.name) || text(p.given_name), email: text(p.email), picture: text(p.picture) });
  } catch {
    return null;
  }
}

function toIdentity(value: unknown): GoogleIdentity | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const email = typeof v.email === "string" ? v.email : "";
  const name = (typeof v.name === "string" && v.name) || email;
  if (!name) return null;
  const picture = typeof v.picture === "string" && v.picture.startsWith("https://") ? v.picture : "";
  return { name, email, picture };
}

export function readIdentity(): GoogleIdentity | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? toIdentity(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: GoogleIdentity): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: identity.name, email: identity.email, picture: identity.picture }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Forgets the Google identity; the header falls back to the Dr. Rowan demo account.
 * Google is told to stop auto-selecting only when someone was signed in, so the demo path writes nothing.
 */
export function clearIdentity(): void {
  let hadIdentity = false;
  try {
    hadIdentity = window.localStorage.getItem(STORAGE_KEY) !== null;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: there is nothing stored to clear.
  }
  if (!hadIdentity) return;
  try {
    gsi()?.disableAutoSelect();
  } catch {
    // Google's script is not loaded on this page.
  }
}

export function initials(name: string): string {
  const words = name.split("@")[0].split(/[\s._-]+/).filter(Boolean);
  // Array.from splits by code point, so a name starting with an emoji or a math letter keeps the whole character.
  const first = (word: string) => Array.from(word)[0] ?? "";
  const letters = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : Array.from(words[0] ?? "?").slice(0, 2).join("");
  return letters.toUpperCase();
}
