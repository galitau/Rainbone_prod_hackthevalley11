"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

type HeaderPopoverProps = {
  label: string; // the icon button's accessible name
  icon: React.ReactNode;
  title: string; // the panel's heading
  dot?: boolean; // a small marker over the icon (the bell's unread dot)
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

// An icon button in the dashboard header that opens a panel under it. Esc, a click outside or moving focus out
// closes it, and so does following a link in it. The panel takes focus when it opens, and Esc or its close button
// hands focus back to the button.
// Below sm the wrapper is not positioned, so the panel lines up with the sticky header's right edge instead of
// the button and stays on screen at 390 px.
export function HeaderPopover({ label, icon, title, dot, onOpenChange, children }: HeaderPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const panelId = `${id}-panel`;
  const titleId = `${id}-title`;

  const latest = useRef(onOpenChange);
  useEffect(() => {
    latest.current = onOpenChange;
  });
  useEffect(() => {
    latest.current?.(open);
  }, [open]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    // Capture phase, so a 3D view that handles its own pointer events still closes the panel.
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div
      ref={wrapper}
      className="flex sm:relative"
      onBlur={(event) => {
        if (open && event.relatedTarget instanceof Node && !wrapper.current?.contains(event.relatedTarget)) close(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`relative rounded-lg p-2 transition hover:bg-sunken hover:text-ink ${open ? "bg-sunken text-ink" : "text-muted"}`}
      >
        {icon}
        {dot && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical ring-2 ring-surface" aria-hidden />}
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          // A link in the panel closes it, also when it points at the page already open.
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a[href]")) close(true);
          }}
          className="absolute right-4 top-full z-20 mt-2 max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface text-left shadow-raised focus-visible:outline-none sm:right-0 sm:max-h-[calc(100dvh-5rem)] sm:w-[22rem]"
        >
          <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3.5">
            <h2 id={titleId} className="text-[15px] font-semibold text-ink">{title}</h2>
            <button type="button" onClick={() => close(true)} aria-label={`Close ${title.toLowerCase()}`} className="rounded-md p-1 text-muted transition hover:bg-sunken hover:text-ink">
              <X size={16} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
