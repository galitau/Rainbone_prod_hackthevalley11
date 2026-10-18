"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// The patient overview's own layout from lg up: how wide the panel column is and which panels are collapsed.
// Remembered per browser; the page renders the defaults when storage is unavailable.

export type PanelId = "metrics" | "risk" | "plain" | "numbers" | "history";
type Layout = { panelWidth: number; collapsed: Record<PanelId, boolean> };

export const PANEL_MIN = 320;
export const PANEL_MAX = 640;
// 360 leaves the viewer wide enough at 1366 px for its header to stay on one row.
export const PANEL_DEFAULT = 360;
// The viewer header (Anatomy · Stress · Displacement, reset, fullscreen) needs about 400 px; the panel column's
// max-width in dashboard.tsx (100% - 416px) is this plus the splitter.
const VIEWER_MIN = 400;
const SPLITTER_W = 16;
const STEP = 16;
const BIG_STEP = 64;
const STORAGE_KEY = "rainbone.overview-layout.v1";

// The defaults are the overview as it looks without any saved layout (All numbers starts closed).
const DEFAULT_LAYOUT: Layout = {
  panelWidth: PANEL_DEFAULT,
  collapsed: { metrics: false, risk: false, plain: false, numbers: true, history: false },
};
const PANEL_IDS = Object.keys(DEFAULT_LAYOUT.collapsed) as PanelId[];

function readLayout(): Layout | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return null;
    const { panelWidth, collapsed } = saved as { panelWidth?: unknown; collapsed?: unknown };
    const flags = (collapsed && typeof collapsed === "object" ? collapsed : {}) as Record<string, unknown>;
    return {
      panelWidth: typeof panelWidth === "number" && Number.isFinite(panelWidth)
        ? Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, panelWidth)))
        : PANEL_DEFAULT,
      collapsed: Object.fromEntries(PANEL_IDS.map(id => {
        const flag = flags[id];
        return [id, typeof flag === "boolean" ? flag : DEFAULT_LAYOUT.collapsed[id]];
      })) as Record<PanelId, boolean>,
    };
  } catch {
    return null;
  }
}

function writeLayout(layout: Layout) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage blocked or full: the layout still applies until the page is reloaded.
  }
}

function clearLayout() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved that could be read back.
  }
}

export function useOverviewLayout() {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const current = useRef(layout);

  // Every change goes through here and writes storage itself: a write effect would run with the defaults
  // in the same commit as the restore below and overwrite the saved layout.
  const commit = useCallback((next: Layout, persist: boolean) => {
    current.current = next;
    setLayout(next);
    if (persist) writeLayout(next);
  }, []);

  // After hydration and before paint, so the server markup matches and the saved width does not flash.
  useLayoutEffect(() => {
    const saved = readLayout();
    if (saved) commit(saved, false);
  }, [commit]);

  const setCollapsed = useCallback((id: PanelId, collapsed: boolean) => {
    const layout = current.current;
    if (layout.collapsed[id] === collapsed) return;
    commit({ ...layout, collapsed: { ...layout.collapsed, [id]: collapsed } }, true);
  }, [commit]);

  // While dragging, the width only renders; it is saved when the drag ends.
  const setPanelWidth = useCallback((panelWidth: number, persist: boolean) => {
    const layout = current.current;
    if (layout.panelWidth === panelWidth && !persist) return;
    commit({ ...layout, panelWidth }, persist);
  }, [commit]);

  const reset = useCallback(() => {
    commit(DEFAULT_LAYOUT, false);
    clearLayout();
  }, [commit]);

  return { ...layout, setCollapsed, setPanelWidth, reset };
}

type CollapsiblePanelProps = {
  id: PanelId;
  title: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  className?: string;
  children: React.ReactNode;
};

// Wraps one existing card and adds a −/+ button over its header row. Collapsing hides everything but that
// row (globals.css, .panel-frame); a <details> card (All numbers) is closed and opened through `open`.
// A card that renders nothing (API unavailable) leaves no empty slot. The button comes first in the DOM so
// keyboard and screen-reader users reach it before the card body, where it sits on screen.
export function CollapsiblePanel({ id, title, collapsed, onCollapsedChange, className, children }: CollapsiblePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onCollapsedChange);
  useEffect(() => {
    latest.current = onCollapsedChange;
  });

  useEffect(() => {
    const details = ref.current?.querySelector<HTMLDetailsElement>(":scope > details");
    if (details && details.open === collapsed) details.open = !collapsed;
  }, [collapsed]);

  // A click on the card's own summary, or Import scan opening it, flips the button and is remembered too.
  useEffect(() => {
    const details = ref.current?.querySelector<HTMLDetailsElement>(":scope > details");
    if (!details) return;
    const sync = () => latest.current(!details.open);
    details.addEventListener("toggle", sync);
    return () => details.removeEventListener("toggle", sync);
  }, []);

  return (
    <div ref={ref} data-panel={id} data-collapsed={collapsed} className={`panel-frame relative lg:shrink-0${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        onClick={() => onCollapsedChange(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={`${title} panel`}
        title={collapsed ? "Expand" : "Collapse"}
        className="absolute right-4 top-4 z-[1] hidden h-6 w-6 items-center justify-center rounded-md border border-line bg-surface font-mono text-[13px] leading-none text-muted transition hover:border-line-strong hover:text-ink lg:inline-flex"
      >
        {collapsed ? "+" : "−"}
      </button>
      {children}
    </div>
  );
}

type PanelSplitterProps = {
  width: number;
  rowRef: React.RefObject<HTMLDivElement | null>;
  onResize: (width: number, persist: boolean) => void;
};

// The handle between the viewer and the panel column. Dragging left widens the panels; the viewer keeps at least
// VIEWER_MIN px. Arrow keys move it by STEP (Shift: BIG_STEP), Home and End go to the limits, Enter and a double-click
// restore the default. It works from the column's rendered width: CSS caps the column when the row cannot fit the
// saved width, and that saved width is kept until the handle actually moves.
export function PanelSplitter({ width, rowRef, onResize }: PanelSplitterProps) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; w: number; last: number } | null>(null);
  const [measured, setMeasured] = useState<{ shown: number; min: number; max: number } | null>(null);
  const self = useRef<HTMLDivElement>(null);

  // The range the row allows: up to PANEL_MAX while the viewer keeps VIEWER_MIN. Between 1024 and about 1040 px wide
  // that is under PANEL_MIN, and the column is pinned at the CSS cap.
  const limits = useCallback(() => {
    const row = rowRef.current?.clientWidth;
    const cap = row ? Math.min(PANEL_MAX, row - SPLITTER_W - VIEWER_MIN) : PANEL_MAX;
    return { min: Math.min(PANEL_MIN, cap), max: Math.max(Math.min(PANEL_MIN, cap), cap) };
  }, [rowRef]);
  const rendered = () => {
    const panels = document.getElementById("overview-panels");
    return panels ? Math.round(panels.getBoundingClientRect().width) : width;
  };
  const clamp = (px: number) => {
    const { min, max } = limits();
    return Math.round(Math.min(max, Math.max(min, px)));
  };

  useEffect(() => {
    const panels = document.getElementById("overview-panels");
    const row = rowRef.current;
    if (!panels || !row || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // Below lg the handle is hidden and the column is full width; nothing to report.
      if (!self.current?.getClientRects().length) return;
      setMeasured({ shown: Math.round(panels.getBoundingClientRect().width), ...limits() });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panels);
    observer.observe(row);
    return () => observer.disconnect();
  }, [rowRef, limits]);

  const shown = measured?.shown ?? width;

  const restoreBody = () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  useEffect(() => restoreBody, []);

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    restoreBody();
    if (current.last !== current.w) onResize(current.last, true);
  };

  return (
    <div
      ref={self}
      role="separator"
      aria-orientation="vertical"
      aria-controls="overview-panels"
      aria-label="Resize the panel column"
      aria-valuemin={measured ? Math.min(measured.min, shown) : PANEL_MIN}
      aria-valuemax={measured ? Math.max(measured.max, shown) : PANEL_MAX}
      aria-valuenow={shown}
      aria-valuetext={`Panels ${shown} pixels wide`}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      data-dragging={dragging}
      className="group relative hidden w-4 shrink-0 cursor-col-resize touch-none select-none focus-visible:outline-none lg:block"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const w = rendered();
        drag.current = { id: event.pointerId, x: event.clientX, w, last: w };
        setDragging(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const next = clamp(current.w - (event.clientX - current.x));
        if (next === current.last) return;
        current.last = next;
        onResize(next, false);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => onResize(clamp(PANEL_DEFAULT), true)}
      onKeyDown={event => {
        const base = rendered();
        let next: number;
        switch (event.key) {
          case "ArrowLeft": next = base + (event.shiftKey ? BIG_STEP : STEP); break;
          case "ArrowRight": next = base - (event.shiftKey ? BIG_STEP : STEP); break;
          case "Home": next = PANEL_MIN; break;
          case "End": next = PANEL_MAX; break;
          case "Enter": next = PANEL_DEFAULT; break;
          default: return;
        }
        event.preventDefault();
        next = clamp(next);
        if (next !== base) onResize(next, true);
      }}
    >
      <span aria-hidden className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-line transition-colors group-hover:bg-line-strong group-focus-visible:w-[3px] group-focus-visible:bg-focus group-data-[dragging=true]:w-[3px] group-data-[dragging=true]:bg-focus" />
      <span aria-hidden className="absolute left-1/2 top-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line-strong bg-surface" />
    </div>
  );
}
