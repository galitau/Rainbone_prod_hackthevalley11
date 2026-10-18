"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Compass, Database, FileCheck, PenLine, ShieldCheck, Sparkles, Send, X } from "lucide-react";
import { useReducedMotion } from "@/lib/preferences";
import { aiAnswerLabel } from "@/lib/ai-label";
import { ASK_EVENT, askRainbone, checkedAskUrl, type AskAnswer } from "@/lib/ask-rainbone";
import { AskUsageLine } from "@/components/ask-usage-line";
import { GroundingLine } from "@/components/grounding-line";

const SUGGESTIONS = ["What does the 47% mean?", "Why isn't the 11% a fracture chance?", "How do I cut the bone open?"];
type Exchange = { question: string; answer?: AskAnswer; error?: string; startedAt: number; elapsedMs?: number };
const STAGES = [
  { id: "triage", label: "Triage", Icon: Compass },
  { id: "evidence", label: "Evidence", Icon: Database },
  { id: "writer", label: "Writer", Icon: PenLine },
  { id: "critic", label: "Critic", Icon: ShieldCheck },
  { id: "audit", label: "Audit", Icon: FileCheck },
];

export function ExecutionTrace({ exchange }: { exchange: Exchange }) {
  const reduced = useReducedMotion();
  const pending = !exchange.answer && !exchange.error;
  const trace = exchange.answer?.trace ?? [];
  const [elapsed, setElapsed] = useState(0);
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const update = () => setElapsed(Math.max(0, performance.now() - exchange.startedAt));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [pending, exchange.startedAt]);
  useEffect(() => {
    setRevealed(0);
    if (!trace.length || reduced) return;
    const timers = trace.map((_, index) => window.setTimeout(() => setRevealed(index + 1), index * 120));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [exchange.answer, reduced]);
  const count = reduced ? trace.length : revealed;
  const total = exchange.elapsedMs ?? elapsed;
  const answer = exchange.answer;
  const writer = answer?.provider === "template" ? "Rules" : answer?.provider === "groq" ? "Groq" : "Gemini";
  const reused = answer?.served === "cached" || answer?.served === "saved";
  const gemini429 = !reused && answer?.provider === "groq" && trace.some(step => /gemini/i.test(step.summary) && /\b429\b/.test(step.summary));
  return <section aria-label="Answer execution" className="ask-execution space-y-2" data-reduced={reduced}>
    <div className="flex items-center justify-between gap-2 text-[11px] text-body"><span>{pending ? "Working · stage progress unavailable" : exchange.error ? "Request ended" : "Recorded execution"}</span><span aria-label={`Request elapsed ${(total / 1000).toFixed(1)} seconds`} className="shrink-0 font-mono tabular-nums">{(total / 1000).toFixed(1)} s</span></div>
    <ol className={`ask-stage-row relative grid grid-cols-5 gap-1 overflow-hidden rounded-lg border border-line bg-sunken p-2 ${pending ? "ask-stage-working" : ""}`} aria-label="Execution stages">
      {STAGES.map(({ id, label, Icon }) => {
        const events = trace.slice(0, count).filter(step => step.stage.toLowerCase() === id);
        const recorded = events.length > 0;
        return <li key={id} data-stage={id} data-recorded={recorded} className={`ask-stage relative min-w-0 rounded-md py-1 text-center ${recorded ? "bg-link/10 text-link" : "text-muted"}`}>
          <Icon size={16} className="mx-auto" aria-hidden />
          <span className="mt-1 block text-[9px] font-medium leading-4">{label}</span>
          {id === "writer" && answer && <span className="block text-[8px] leading-3">{writer}{reused ? " · reused" : ""}</span>}
          <span title={recorded ? "Longest recorded event in this stage; events may overlap" : undefined} className="block font-mono text-[8px] leading-3">{recorded ? `${Math.round(Math.max(...events.map(event => event.ms)))} ms` : pending || count < trace.length ? "—" : "No record"}</span>
        </li>;
      })}
    </ol>
    {answer && <p className="text-[10px] leading-4 text-muted">{gemini429 ? "Gemini 429 → Groq · " : ""}{aiAnswerLabel(answer)}{answer.served === "cached" ? " · reused; no new writer call" : answer.served === "saved" ? " · saved selection reused" : ""} · node times: longest recorded event{trace.length > count && !reduced ? " · revealing recorded steps" : ""}</p>}
    {answer && (trace.length > 0 || answer.steps.length > 0) ? <details className="rounded-lg border border-line bg-sunken/60 px-3 py-2 text-[11px] leading-5 text-muted">
      <summary className="cursor-pointer font-medium text-body">Steps used for this answer</summary>
      {trace.length ? <ol className="mt-2 space-y-2">{trace.map((step, i) => <li key={i} hidden={i >= count} className="ask-trace-step border-l-2 border-link/40 pl-2">
        <div className="flex items-start justify-between gap-2"><span className="font-medium text-ink">{step.stage}</span><span className="shrink-0 font-mono text-[10px]">{Math.round(step.ms)} ms</span></div>
        {step.tool && <p className="break-all font-mono text-[10px] text-link">{step.tool}</p>}<p className="break-words">{step.summary}</p>
      </li>)}</ol> : <ul className="mt-1">{answer.steps.map((step, i) => <li key={i}>→ {step}</li>)}</ul>}
      {!!answer.tools_used?.length && <p className="mt-2 break-words border-t border-line pt-2">Evidence tools for this answer: {answer.tools_used.join(", ")}</p>}
    </details> : null}
  </section>;
}

// React renders only text and allowlisted links, never HTML or model-supplied markup.
function AnswerText({ answer }: { answer: AskAnswer }) {
  const parts = answer.answer.split(/(\[[^\]\n]+\](?:\([^\)\n]+\))?)/g);
  return <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const source = !link && part.startsWith("[") ? answer.sources.find(s => s.id === part.slice(1, -1)) : undefined;
    const url = checkedAskUrl(link?.[2] ?? source?.url);
    return url ? <a key={index} href={url} className="rounded text-link underline underline-offset-2" {...(url.startsWith("https:") ? {target:"_blank", rel:"noreferrer noopener"} : {})}>{link?.[1] ?? part}</a> : part;
  })}</p>;
}

export function AskRainbone() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);

  function show(prefill?: string) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    if (prefill !== undefined) setQuestion(prefill.slice(0, 500));
    setOpen(true);
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  useEffect(() => {
    mounted.current = true;
    setReady(true);
    const followup = (event: Event) => show(typeof (event as CustomEvent).detail === "string" ? (event as CustomEvent<string>).detail : "");
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing
        || target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
        || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      show();
    };
    window.addEventListener(ASK_EVENT, followup);
    window.addEventListener("keydown", shortcut);
    return () => { mounted.current = false; request.current?.abort(); window.removeEventListener(ASK_EVENT, followup); window.removeEventListener("keydown", shortcut); };
  }, []);
  useEffect(() => {
    if (!ready || !open) return;
    const node = dialog.current;
    node?.showModal();
    input.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [ready, open]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [exchanges, loading, open]);

  async function send() {
    const text = question.trim();
    if (!text || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setQuestion("");
    const startedAt = performance.now();
    setExchanges(previous => [...previous, { question: text, startedAt }]);
    setLoading(true);
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 35_000);
    try {
      const answer = await askRainbone(text, pathname, controller.signal);
      if (mounted.current) setExchanges(previous => previous.map((item, i) => i === previous.length - 1 ? { ...item, answer, elapsedMs: performance.now() - startedAt } : item));
    } catch (cause) {
      const error = timedOut ? "The answer took too long. Please try again." : cause instanceof Error && cause.name !== "TypeError" ? cause.message : "Could not reach Rainbone. Check your connection and try again.";
      if (mounted.current) setExchanges(previous => previous.map((item, i) => i === previous.length - 1 ? { ...item, error, elapsedMs: performance.now() - startedAt } : item));
    } finally {
      window.clearTimeout(timer);
      if (request.current === controller) request.current = null;
      if (mounted.current) setLoading(false);
    }
  }

  return <>
    <button ref={trigger} type="button" onClick={() => show()} aria-label="Ask Rainbone" aria-haspopup="dialog" aria-expanded={open} title="Ask Rainbone (/)" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-xs font-medium text-white transition hover:opacity-90 sm:text-[13px]"><Sparkles size={16} aria-hidden /><span className="hidden sm:inline">Ask Rainbone</span></button>
    {ready && createPortal(<dialog ref={dialog} aria-labelledby="ask-rainbone-title" aria-describedby="ask-rainbone-description" onKeyDown={event => {
      if (event.key !== "Tab") return;
      const node = dialog.current;
      if (!node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex='-1'])"))
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first || !last) { event.preventDefault(); node.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }} onCancel={() => setOpen(false)} onClose={() => { setOpen(false); const target = returnFocus.current; if (target?.isConnected) target.focus(); else trigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-ink backdrop:bg-black/45">
      <div data-reduced={reduced} className="ask-drawer-panel absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[380px]" onClick={event => event.stopPropagation()}>
        <header className="shrink-0 border-b border-line px-5 py-5">
          <div className="flex items-center justify-between gap-3"><h2 id="ask-rainbone-title" className="font-serif text-2xl font-semibold">Ask Rainbone</h2><button type="button" onClick={close} aria-label="Close Ask Rainbone" className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink"><X size={20} aria-hidden /></button></div>
          <p id="ask-rainbone-description" className="mt-2 text-xs leading-5 text-body">Answers only from this site&apos;s data. Not medical advice.</p>
        </header>
        <div ref={scroll} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5">
          {exchanges.length === 0 && <div className="space-y-3"><p className="text-sm leading-6 text-body">Ask about the reference bone, its sources or how to use Rainbone. Uploaded scans are not included.</p>{SUGGESTIONS.map(text => <button key={text} type="button" onClick={() => {setQuestion(text); input.current?.focus();}} className="block w-full rounded-r-lg border-l-[3px] border-link bg-sunken px-3 py-3 text-left text-sm leading-5 text-ink hover:bg-link/10">{text}</button>)}</div>}
          {exchanges.map((exchange, index) => <div key={index} className="space-y-4">
            <p className="ml-8 break-words rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm leading-6 text-white">{exchange.question}</p>
            <ExecutionTrace exchange={exchange} />
            {exchange.answer && <div className="ask-answer-content space-y-3" data-reduced={reduced}>
              <AnswerText answer={exchange.answer} />
              <div className="flex flex-wrap gap-2">{exchange.answer.sources.map(source => source.url ? <a key={source.id} href={source.url} {...(source.url.startsWith("https:") ? {target:"_blank",rel:"noreferrer noopener"} : {})} title={source.label} className="rounded-md border border-line bg-sunken px-2 py-1 text-[11px] text-link underline underline-offset-2">[{source.id}]</a> : <span key={source.id} className="rounded-md border border-line px-2 py-1 text-[11px] text-muted">[{source.id}]</span>)}</div>
              <footer className="space-y-1 border-t border-line pt-3 text-[11px] leading-5 text-muted"><p>{aiAnswerLabel(exchange.answer)}</p><p>{exchange.answer.provider === "template" ? "Summary uses checked source statements." : "AI selects from checked source statements."}</p><GroundingLine grounding={exchange.answer.grounding} logged={exchange.answer.logged} /><AskUsageLine workflowUsage={exchange.answer.workflow_usage} writerUsage={exchange.answer.usage} /></footer>
            </div>}
            {exchange.error && <div role="alert" className="rounded-lg border border-caution/40 bg-sunken p-3 text-sm text-caution"><p>{exchange.error}</p><button type="button" onClick={() => {setQuestion(exchange.question); input.current?.focus();}} className="mt-2 text-link underline">Use this question again</button></div>}
          </div>)}
          <p role="status" aria-live="polite" className="text-xs text-muted">{loading ? "Checking Rainbone's sources…" : exchanges.at(-1)?.answer ? "Answer ready." : ""}</p>
        </div>
        <form onSubmit={event => {event.preventDefault(); void send();}} className="shrink-0 border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <label htmlFor="ask-question" className="sr-only">Your question</label>
          <div className="flex items-end gap-2"><textarea ref={input} id="ask-question" rows={2} maxLength={500} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => {if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); void send();}}} placeholder="Ask about this bone or how to use Rainbone…" className="min-w-0 flex-1 resize-none rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm leading-5 text-ink placeholder:text-muted" /><button disabled={loading || !question.trim()} type="submit" aria-label="Send question" className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-3 text-sm font-medium text-white disabled:opacity-50"><Send size={14} aria-hidden />Send</button></div>
          <p className="mt-2 text-[10px] text-muted">{question.length}/500 · Please don&apos;t include personal or patient details.</p>
        </form>
      </div>
    </dialog>, document.body)}
  </>;
}
