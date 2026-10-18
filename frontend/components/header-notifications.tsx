"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { HeaderPopover } from "@/components/header-popover";
import type { ApiHealth } from "@/components/dashboard";
import { fetchHistory, type ExplanationState, type HistoryState, type RiskAnalysisState } from "@/lib/api";

// The bell lists only what the app already reads: the engine's latest saved runs (GET /api/history), the health
// check the overview already polls, and which AI answered the overview's risk analysis and plain-words cards.
// The unread dot means a saved run is newer than the last time this browser opened the panel.

const RECENT = 5;
const POLL_MS = 60_000;
const SEEN_KEY = "rainbone.notifications.seen.v1";

function readSeen(): number | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSeen(value: number) {
  try {
    window.localStorage.setItem(SEEN_KEY, String(value));
  } catch {
    // Storage blocked: the dot still clears for as long as this page is open.
  }
}

// The same format as the saved-runs table (stress-chart.tsx).
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "Time unavailable";
}

const HEALTH = {
  checking: { label: "Checking the engine", detail: "GET /health, checked every 15 s", dot: "bg-muted" },
  online: { label: "Engine online", detail: "GET /health answered · checked every 15 s", dot: "bg-success" },
  offline: { label: "Engine unreachable", detail: "Two GET /health tries in a row failed · checked every 15 s", dot: "bg-caution" },
} as const;

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", groq: "Groq" };
const answeredBy = ({ provider, model }: { provider: string; model: string | null }) =>
  provider === "template" ? "the built-in template (no AI)" : `${PROVIDER_LABELS[provider] ?? provider}${model ? ` · ${model}` : ""}`;

type Props = { health?: ApiHealth; risk?: RiskAnalysisState; explanation?: ExplanationState };

export function HeaderNotifications({ health, risk, explanation }: Props) {
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  // undefined until storage is read after hydration; null when the panel was never opened in this browser.
  const [seen, setSeen] = useState<number | null | undefined>(undefined);
  const [seenBefore, setSeenBefore] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const id = ++latestLoad.current;
    const next = await fetchHistory(RECENT);
    if (id === latestLoad.current) setHistory(next);
  }, []);

  useEffect(() => {
    setSeen(readSeen());
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      latestLoad.current += 1; // ignore an answer that arrives after unmount
    };
  }, [load]);

  const runs = history.status === "ready" ? [...history.runs].reverse().slice(0, RECENT) : [];
  const newest = runs.length > 0 ? Math.max(...runs.map((run) => Date.parse(run.time))) : null;

  // Opening the panel marks everything listed as seen; a run that arrives while it is open is seen too.
  useEffect(() => {
    if (!open) return;
    const stamp = Math.max(Date.now(), newest ?? 0);
    writeSeen(stamp);
    setSeen(stamp);
  }, [open, newest]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSeenBefore(seen ?? null);
      void load();
    }
  };

  const unread = !open && seen !== undefined && newest !== null && (seen === null || newest > seen);
  const isNew = (time: string) => seenBefore === null || Date.parse(time) > seenBefore;
  const newCount = runs.filter((run) => isNew(run.time)).length;
  const summary =
    history.status === "loading" ? "Checking for new activity…"
    : newCount === 0 ? "No new activity"
    : newCount >= RECENT ? `At least ${RECENT} new saved runs`
    : `${newCount} new saved ${newCount === 1 ? "run" : "runs"}`;

  const ai = [
    risk?.status === "ready" && { name: "AI fracture risk analysis", by: answeredBy(risk.analysis) },
    explanation?.status === "ready" && { name: "In plain words", by: answeredBy(explanation.explanation) },
  ].filter((item): item is { name: string; by: string } => Boolean(item));

  const heading = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted";

  return (
    <HeaderPopover
      label={unread ? "Notifications, new activity" : "Notifications"}
      title="Notifications"
      icon={<Bell size={18} aria-hidden />}
      dot={unread}
      onOpenChange={onOpenChange}
    >
      <div className="text-[12.5px] leading-5 text-body">
        <div className="px-5 pt-4" role="status">
          <p className="text-[13.5px] font-medium text-ink">{summary}</p>
          {history.status !== "loading" && <p className="text-[11.5px] text-muted">{seenBefore === null ? "This browser has not opened this panel before." : "Since you last opened this panel."}</p>}
        </div>

        {health && (
          <section aria-labelledby="notify-engine" className="px-5 pt-4">
            <h3 id="notify-engine" className={heading}>Engine</h3>
            <p className="mt-2 flex items-center gap-2 font-medium text-ink"><span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH[health].dot}`} aria-hidden />{HEALTH[health].label}</p>
            <p className="mt-0.5 pl-4 text-[11.5px] text-muted">{HEALTH[health].detail}</p>
          </section>
        )}

        <section aria-labelledby="notify-runs" className="pt-4">
          <h3 id="notify-runs" className={`${heading} px-5`}>Saved simulation runs · newest first</h3>
          {history.status === "loading" && <p className="px-5 pt-2 text-muted">Reading the engine&apos;s saved runs…</p>}
          {history.status === "unavailable" && <p className="px-5 pt-2 text-muted">Saved runs are unavailable ({history.reason}).</p>}
          {history.status === "ready" && runs.length === 0 && <p className="px-5 pt-2 text-muted">The engine has no saved runs yet.</p>}
          {runs.length > 0 && (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {runs.map((run, index) => (
                <li key={run.run_id ?? `${run.time}-${index}`} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      <time dateTime={run.time} className="whitespace-nowrap font-mono text-[11.5px] text-ink">{timestamp(run.time)}</time>
                      {isNew(run.time) && <span className="rounded-full bg-critical/[0.08] px-1.5 text-[10.5px] font-medium text-critical">New</span>}
                    </p>
                    <p title={run.source_filename} className="mt-0.5 truncate font-mono text-[11px] text-muted">{run.source_filename}</p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="font-mono text-[13px] text-ink tabular-nums">{run.max_von_mises_stress_mpa.toFixed(2)}</span>
                    <span className="ml-1 text-[10.5px] text-muted">MPa</span>
                    <span className="block text-[10.5px] text-muted">peak stress</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {ai.length > 0 && (
          <section aria-labelledby="notify-ai" className="px-5 pt-4">
            <h3 id="notify-ai" className={heading}>AI answers on this page</h3>
            <ul className="mt-2 space-y-1.5">
              {ai.map((item) => (
                <li key={item.name}><span className="font-medium text-ink">{item.name}</span><span className="block text-[11.5px] text-muted">Answered by {item.by}</span></li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-4 border-t border-line bg-sunken/60 px-5 py-3 text-[11px] leading-4 text-muted">
          Saved runs come from GET /api/history: each solve this engine completed, whoever sent the scan. Checked when the page opens, when this panel opens and every minute while the page is visible.
        </p>
      </div>
    </HeaderPopover>
  );
}
