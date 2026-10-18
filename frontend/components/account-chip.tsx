"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { GOOGLE_CLIENT_ID, clearIdentity, initials, readIdentity, type GoogleIdentity } from "@/lib/google-identity";

const ITEM = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-body transition hover:bg-sunken hover:text-ink";

/**
 * Header account: the Google name and photo kept in this browser after "Sign in with Google",
 * otherwise the Dr. Rowan demo account. Display only; the API never sees who is signed in.
 */
export function AccountChip() {
  const router = useRouter();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [identity, setIdentity] = useState<GoogleIdentity | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  // localStorage is read after mount; until then the chip keeps its space but stays invisible,
  // so a signed-in person never sees Dr. Rowan flash first. With no client ID built in, Google is off entirely.
  useEffect(() => {
    if (GOOGLE_CLIENT_ID) setIdentity(readIdentity());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const switchToDemo = () => {
    clearIdentity();
    setIdentity(null);
    setOpen(false);
    trigger.current?.focus();
  };

  const signOut = () => {
    clearIdentity();
    setIdentity(null);
    setOpen(false);
    router.push("/enter");
  };

  // Without Google sign-in configured, this is the demo badge it always was.
  const interactive = GOOGLE_CLIENT_ID !== "";
  const name = identity ? identity.name : "Dr. Rowan";
  const detail = identity ? "Signed in with Google" : "Radiology · demo";
  const face = identity ? <Avatar key={identity.picture} identity={identity} /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">DR</div>;
  const label = (
    <>
      {face}
      <div className="hidden text-left xl:block"><p className="max-w-[160px] truncate text-[13px] font-medium leading-4 text-ink">{name}</p><p className="text-[11px] text-muted">{detail}</p></div>
      <ChevronDown size={14} className="text-muted" aria-hidden />
    </>
  );

  return (
    <div ref={root} className={`relative ml-2 hidden border-l border-line pl-4 sm:block ${ready || !interactive ? "" : "invisible"}`}>
      {interactive ? (
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Account: ${name}, ${identity ? "signed in with Google" : "demo account"}`}
          onClick={() => setOpen((value) => !value)}
          className="-m-1 flex items-center gap-3 rounded-lg p-1 transition hover:bg-sunken"
        >
          {label}
        </button>
      ) : (
        <div className="flex items-center gap-3" title="Demo account">{label}</div>
      )}

      {open && (
        <div id={menuId} className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-line bg-surface p-1.5 shadow-raised">
          <div className="border-b border-line px-3 pb-2.5 pt-2">
            <p className="truncate text-[13px] font-medium text-ink">{name}</p>
            <p className="truncate text-[12px] text-muted">{identity ? identity.email || "Signed in with Google" : "Demo account · Radiology"}</p>
          </div>
          <div className="pt-1.5">
            {identity ? (
              <>
                <button type="button" onClick={switchToDemo} className={ITEM}>
                  <UserRound size={16} className="shrink-0 text-muted" aria-hidden /> Switch to demo account (Dr. Rowan)
                </button>
                <button type="button" onClick={signOut} className={ITEM}>
                  <LogOut size={16} className="shrink-0 text-muted" aria-hidden /> Sign out
                </button>
              </>
            ) : (
              <Link href="/enter" onClick={() => setOpen(false)} className={ITEM}>
                <UserRound size={16} className="shrink-0 text-muted" aria-hidden /> Sign in with Google
              </Link>
            )}
          </div>
          {identity && <p className="px-3 pb-1.5 pt-1 text-[11px] leading-4 text-muted">Kept in this browser only. Rainbone&apos;s server never sees it.</p>}
        </div>
      )}
    </div>
  );
}

function Avatar({ identity }: { identity: GoogleIdentity }) {
  const [failed, setFailed] = useState(false);
  if (!identity.picture || failed) {
    return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">{initials(identity.name)}</div>;
  }
  return (
    // A plain <img>: next/image would need Google's photo host whitelisted and would proxy the photo through this site.
    <img src={identity.picture} alt="" width={32} height={32} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-8 w-8 shrink-0 rounded-full object-cover" />
  );
}
