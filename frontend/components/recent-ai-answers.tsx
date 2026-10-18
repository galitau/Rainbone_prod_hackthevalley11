"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { aiAnswerLabel } from "@/lib/ai-label";
import { apiUrl } from "@/lib/api";

type Analysis = {
  id: string;
  time: string;
  endpoint: string;
  provider: string;
  model: string | null;
  facts_sha256: string;
  latency_ms: number | null;
  grounding_store: string | null;
};

const ENDPOINTS: Record<string, string> = { explain: "Plain words", "risk-analysis": "Risk analysis", ask: "Ask Rainbone" };
const STORES: Record<string, string> = { "vultr-object-storage": "Vultr Object Storage", "local-backup": "Bundled backup" };

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["id", "time", "endpoint", "provider", "facts_sha256"].every(key => typeof row[key] === "string")
    && Number.isFinite(Date.parse(row.time as string))
    && /^[0-9a-f]{64}$/.test(row.facts_sha256 as string)
    && (row.model === null || typeof row.model === "string")
    && (row.grounding_store === null || typeof row.grounding_store === "string")
    && (row.latency_ms === null || (typeof row.latency_ms === "number" && Number.isFinite(row.latency_ms) && row.latency_ms >= 0));
}

export function RecentAiAnswers() {
  const [rows, setRows] = useState<Analysis[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight: AbortController | null = null;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8_000);
      setLoading(true);
      try {
        const response = await fetch(apiUrl("/api/ai-log?limit=8"), { signal: controller.signal, cache: "no-store" });
        if (response.status === 503) throw new Error("The AI log is unavailable. It may not be configured, or its database may be offline.");
        if (!response.ok) throw new Error(`The AI log could not be loaded (HTTP ${response.status}).`);
        const body: unknown = await response.json();
        const next = body && typeof body === "object" && "rows" in body ? body.rows : null;
        if (!Array.isArray(next) || !next.every(isAnalysis)) throw new Error("The AI log returned an unreadable response.");
        if (active) {
          setRows(next.slice(0, 8));
          setError(null);
          setRefreshedAt(new Date());
        }
      } catch (cause) {
        if (active) setError(controller.signal.aborted ? "The AI log did not respond in time. Try refreshing." : cause instanceof Error ? cause.message : "The AI log could not be reached.");
      } finally {
        window.clearTimeout(timeout);
        inFlight = null;
        if (active) setLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      inFlight?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshKey]);

  return <section id="recent-ai-answers" aria-labelledby="recent-ai-title" className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 id="recent-ai-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-ink"><Database size={18} aria-hidden className="shrink-0 text-link" />Recent AI answers</h2>
        <p className="mt-1 text-[12.5px] leading-5 text-body">Recent answers recorded in Tiger Cloud (TimescaleDB). Facts and answer fingerprints, not their text.</p>
      </div>
      <button type="button" onClick={() => setRefreshKey(key => key + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-xs font-medium text-ink hover:bg-sunken disabled:opacity-50"><RefreshCw size={14} aria-hidden />Refresh</button>
    </header>

    <p role="status" aria-live="polite" className="px-5 py-3 text-xs leading-5 text-muted">
      {error ? `${error}${rows ? " Showing the last successful read." : ""}` : loading ? rows ? "Refreshing saved records…" : "Loading saved records…" : rows?.length === 0 ? "No AI answer records have been saved yet." : `Last read ${refreshedAt?.toLocaleTimeString() ?? "just now"}. Times are shown in your time zone.`}
    </p>

    {rows && rows.length > 0 && <div role="region" aria-label="Recent AI answer records, scroll horizontally for all columns" tabIndex={0} className="max-w-full overflow-x-auto border-y border-line">
      <table className="w-full min-w-[820px] text-left text-xs">
        <caption className="sr-only">The most recent recorded answers. No verification status or cache status is stored in these records.</caption>
        <thead className="bg-sunken text-muted"><tr>{["Local time", "Feature", "Answer source", "Facts source", "Answer preparation", "Facts fingerprint"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.time}:${row.id}`} className="border-t border-line text-body">
          <td className="whitespace-nowrap px-4 py-3"><time dateTime={row.time}>{new Date(row.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></td>
          <td className="px-4 py-3">{ENDPOINTS[row.endpoint] ?? row.endpoint}</td>
          <td className="max-w-[260px] break-words px-4 py-3 text-ink">{aiAnswerLabel({ provider: row.provider, model: row.model })}</td>
          <td className="px-4 py-3">{row.grounding_store ? STORES[row.grounding_store] ?? row.grounding_store : "Not recorded"}</td>
          <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums">{row.latency_ms === null ? "Not recorded" : `${Math.round(row.latency_ms).toLocaleString()} ms`}</td>
          <td className="px-4 py-3"><code title={row.facts_sha256} className="font-mono text-[11px]">{row.facts_sha256.slice(0, 12)}…</code></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <p className="px-5 py-4 text-[11.5px] leading-5 text-muted">Logging is best effort. Reused and saved answers do not add a new record. Preparation time excludes the logging write. These records do not store a verification or cache status.</p>
  </section>;
}
