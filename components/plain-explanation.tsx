"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import type { Explanation, ExplanationState } from "@/lib/api";

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", groq: "Groq" };
const CLAMP_FROM_CHARS = 200; // shorter texts fit in three lines anyway

function sourceLabel({ provider, model }: Explanation) {
  if (provider === "template") return "Explained by the built-in template";
  return `Explained by ${PROVIDER_LABELS[provider] ?? provider}${model ? ` · ${model}` : ""}`;
}

export function PlainExplanation({ state }: { state: ExplanationState }) {
  const [open, setOpen] = useState(false);
  if (state.status === "idle" || state.status === "unavailable") return null;
  const clamp = state.status === "ready" && state.explanation.text.length > CLAMP_FROM_CHARS;
  return (
    <section
      className="rounded-2xl border border-accent/15 bg-accent-soft p-5 shadow-card"
      aria-labelledby="plain-words-title"
      aria-live="polite"
      aria-busy={state.status === "loading"}
    >
      <h2 id="plain-words-title" className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
          <MessageSquareText size={15} aria-hidden />
        </span>
        In plain words
      </h2>
      {state.status === "loading" && (
        <div className="mt-3 space-y-2" aria-label="Writing the explanation">
          <p className="text-caption text-muted">Explaining the femur&apos;s results in plain words…</p>
          <span className="block h-3 w-full animate-pulse rounded bg-accent/10" />
          <span className="block h-3 w-4/5 animate-pulse rounded bg-accent/10" />
        </div>
      )}
      {state.status === "error" && <p className="mt-3 text-caption text-warning">{state.message}</p>}
      {state.status === "ready" && (
        <>
          <p id="plain-words-text" className={`mt-3 text-lead text-ink ${clamp && !open ? "line-clamp-3" : ""}`}>
            {state.explanation.text}
          </p>
          {clamp && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls="plain-words-text"
              onClick={() => setOpen((value) => !value)}
              className="mt-1 inline-flex min-h-9 items-center text-caption font-medium text-accent underline-offset-2 hover:underline"
            >
              {open ? "Show less" : "Read the full explanation"}
            </button>
          )}
          <p className="mt-3 border-t border-accent/15 pt-3 text-label text-muted">
            {sourceLabel(state.explanation)} · every number in it was checked against the femur&apos;s solved values
          </p>
        </>
      )}
    </section>
  );
}
