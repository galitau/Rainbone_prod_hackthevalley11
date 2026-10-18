"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// The patient overview's own layout from lg up: how wide the panel column is and which panels are collapsed.
// Remembered per browser; the page renders the defaults when storage is unavailable.

export type PanelId = "metrics" | "risk" | "plain" | "numbers" | "history";
type Layout = { panelWidth: number; collapsed: Record<PanelId, boolean> };

export const PANEL_MIN = 320;
export const PANEL_MAX = 640;
export const PANEL_DEFAULT = 380;
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
  children: React.ReactNode;
};

// Wraps one existing card and adds a −/+ button over its header row. Collapsing hides everything but that
// row (globals.css, .panel-frame); a <details> card (All numbers) is closed and opened through `open`.
// A card that renders nothing (API unavailable) leaves no empty slot.
export function CollapsiblePanel({ id, title, collapsed, onCollapsedChange, children }: CollapsiblePanelProps) {
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
    <div ref={ref} data-panel={id} data-collapsed={collapsed} className="panel-frame relative lg:shrink-0">
      {children}
      <button
        type="button"
        onClick={() => onCollapsedChange(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
        title={collapsed ? "Expand" : "Collapse"}
        className="absolute right-4 top-4 z-[1] hidden h-6 w-6 items-center justify-center rounded-md border border-line bg-surface font-mono text-[13px] leading-none text-muted transition hover:border-line-strong hover:text-ink lg:inline-flex"
      >
        {collapsed ? "+" : "−"}
      </button>
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
// restore the default.
export function PanelSplitter({ width, rowRef, onResize }: PanelSplitterProps) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; w: number; last: number } | null>(null);

  const maxWidth = useCallback(
    () => Math.max(PANEL_MIN, Math.min(PANEL_MAX, (rowRef.current?.clientWidth ?? Infinity) - SPLITTER_W - VIEWER_MIN)),
    [rowRef],
  );
  const clamp = useCallback((px: number) => Math.round(Math.min(maxWidth(), Math.max(PANEL_MIN, px))), [maxWidth]);

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
    onResize(current.last, true);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-controls="overview-panels"
      aria-label="Resize the panel column"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      aria-valuetext={`Panels ${width} pixels wide`}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      data-dragging={dragging}
      className="group relative hidden w-4 shrink-0 cursor-col-resize touch-none select-none focus-visible:outline-none lg:block"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, w: width, last: width };
        setDragging(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        current.last = clamp(current.w - (event.clientX - current.x));
        onResize(current.last, false);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => onResize(clamp(PANEL_DEFAULT), true)}
      onKeyDown={event => {
        let next: number;
        switch (event.key) {
          case "ArrowLeft": next = width + (event.shiftKey ? BIG_STEP : STEP); break;
          case "ArrowRight": next = width - (event.shiftKey ? BIG_STEP : STEP); break;
          case "Home": next = PANEL_MIN; break;
          case "End": next = maxWidth(); break;
          case "Enter": next = PANEL_DEFAULT; break;
          default: return;
        }
        event.preventDefault();
        onResize(clamp(next), true);
      }}
    >
      <span aria-hidden className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-line transition-colors group-hover:bg-line-strong group-focus-visible:w-[3px] group-focus-visible:bg-focus group-data-[dragging=true]:w-[3px] group-data-[dragging=true]:bg-focus" />
      <span aria-hidden className="absolute left-1/2 top-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line-strong bg-surface" />
    </div>
  );
}
