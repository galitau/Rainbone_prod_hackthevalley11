"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PressViewer } from "@/components/press-viewer";
import { BoneReconstructionExport } from "@/components/bone-reconstruction-export";
import { PRESS_PATH, pressStage, type PressField, type PressModel } from "@/lib/press-model";

const inputStyle = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-focus";

export function PhysicsSimulations() {
  const [model, setModel] = useState<PressModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [field, setField] = useState<PressField>("failure_index");
  const [scale, setScale] = useState(10);
  const [edges, setEdges] = useState(false);
  const onReady = useCallback((ready: boolean) => setViewerReady(ready), []);

  useEffect(() => {
    const abort = new AbortController();
    setError(null);
    fetch(`${PRESS_PATH}/manifest.json`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error("The compression simulation could not be loaded."); return response.json(); })
      .then((data: PressModel) => {
        if (!Array.isArray(data.frames) || data.frames.length < 2 || !data.frames.every(frame => Number.isFinite(frame.load_n) && Number.isFinite(frame.stroke_mm))) throw new Error("The compression report is incomplete.");
        setModel(data);
      })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the simulation."); });
    return () => abort.abort();
  }, [attempt]);

  useEffect(() => {
    if (!playing || !model || !viewerReady) return;
    if (frameIndex >= model.frames.length - 1) { setPlaying(false); return; }
    const beforeBreak = model.frames.findIndex(frame => frame.eroded_volume_percent > 0) - 1;
    const duration = frameIndex === beforeBreak ? 1200 : 425;
    const timer = window.setTimeout(() => setFrameIndex(index => index + 1), duration);
    return () => window.clearTimeout(timer);
  }, [playing, model, viewerReady, frameIndex]);

  const lastStep = (model?.frames.length ?? 1) - 1;
  const firstBreak = model?.frames.findIndex(frame => frame.eroded_volume_percent > 0) ?? -1;
  const frame = model?.frames[frameIndex];
  const stage = frame ? pressStage(frame) : "Loading simulation";
  const damaged = frame && frame.max_damage > .05;
  const chart = model?.frames.map((item, index) => ({ stroke: item.stroke_mm, force: item.load_n / 1000, completed: index <= frameIndex ? item.load_n / 1000 : null }));
  function scrub(index: number) { setPlaying(false); setFrameIndex(index); }
  function togglePlayback() { if (frameIndex === lastStep) setFrameIndex(0); setPlaying(value => !value); }
  function restartPlayback() { setFrameIndex(0); setPlaying(true); }

  return <div className="p-5 md:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Virtual mechanical testing</p><h2 className="mt-2 font-serif text-[28px] font-semibold tracking-[-0.01em] text-ink">Femur under compression</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Follow the colors as local deformation approaches the model’s failure limit, then watch damage develop under compression.</p></div>
      <span className="flex items-center gap-2 rounded-full border border-caution/25 bg-caution/[0.07] px-3 py-1.5 text-[11px] text-caution"><FlaskConical size={14} /> Research demonstration</span>
    </div>
    <p className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-xs leading-5 text-muted">This model uses assumed material and failure properties. Its damage visualization is exploratory and cannot diagnose fracture risk or provide early detection.</p>
    {error && <div role="alert" className="rounded-xl border border-caution/30 bg-surface p-6 text-sm"><p>{error}</p><button className="mt-3 text-link underline" onClick={() => setAttempt(value => value + 1)}>Retry simulation</button></div>}
    {!model && !error && <div role="status" className="flex h-96 items-center justify-center rounded-2xl border border-line bg-surface shadow-card text-sm text-muted">Loading compression test…</div>}
    {model && frame && <>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Press playback controls" className="rounded-2xl border border-line bg-surface shadow-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-medium">FEA compression</h3><p className="mt-1 text-xs text-muted">Step {frameIndex + 1} of {model.frames.length} · {frame.stroke_mm.toFixed(3)} mm applied displacement</p></div>
              <div className="flex items-center gap-2">
                <button aria-label="Previous compression step" disabled={frameIndex === 0} onClick={() => scrub(frameIndex - 1)} className="rounded-lg border border-line p-2 text-muted disabled:opacity-30"><ChevronLeft size={16} /></button>
                <button aria-label={playing ? "Pause compression" : "Run compression"} disabled={!viewerReady && !playing} onClick={togglePlayback} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause" : frameIndex === lastStep ? "Replay" : "Run press"}</button>
                <button aria-label="Next compression step" disabled={frameIndex === lastStep} onClick={() => scrub(frameIndex + 1)} className="rounded-lg border border-line p-2 text-muted disabled:opacity-30"><ChevronRight size={16} /></button>
                <button aria-label="Reset compression test" onClick={() => scrub(0)} className="rounded-lg border border-line p-2 text-muted"><RotateCcw size={15} /></button>
              </div>
            </div>
            <input aria-label="Compression step" type="range" min={0} max={lastStep} step={1} value={frameIndex} onChange={event => scrub(Number(event.target.value))} className="mt-5 w-full accent-primary" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted"><span>UNLOADED</span><span>COMPRESSION → DAMAGE</span></div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              {firstBreak > 0 && <><button onClick={() => { scrub(firstBreak - 1); setField("failure_index"); }} className="rounded-md border border-line px-3 py-2 text-link">Before break</button><button onClick={() => { scrub(firstBreak); setField("failure_index"); }} className="rounded-md border border-line px-3 py-2 text-link">After break</button></>}
            </div>
            {frameIndex === firstBreak - 1 && <p className="mt-3 text-[11px] leading-5 text-caution">Last solved step before a visible gap. In Failure proximity, red elements have reached the assumed strain limit that initiates damage. The gap develops between saved steps.</p>}
          </section>
          <PressViewer model={model} frameIndex={frameIndex} field={field} scale={scale} edges={edges} playing={playing} onTogglePlayback={togglePlayback} onRestart={restartPlayback} onScrub={scrub} onReady={onReady} />
        </div>
        <aside aria-label="Compression results and settings" className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface shadow-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted">Current state</p>
            <p aria-live="polite" className={`mt-2 text-sm font-medium ${damaged ? "text-caution" : "text-link"}`}>{stage}</p>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Metric label="Reaction force" value={(frame.load_n / 1000).toFixed(2)} unit="kN" />
              <Metric label="Press stroke" value={frame.stroke_mm.toFixed(3)} unit="mm" />
              {field === "stress_mpa" ? <Metric label="Peak nodal stress" value={frame.max_nodal_stress_mpa.toFixed(1)} unit="MPa" /> : <Metric label="Peak failure index" value={frame.max_failure_index.toFixed(2)} unit="× limit" />}
              <Metric label="Max displacement" value={frame.max_displacement_mm.toFixed(2)} unit="mm" />
            </div>
            <div className="mt-5 border-t border-line pt-4"><div className="flex items-center justify-between text-xs"><span className="text-muted">Damaged volume</span><span className={damaged ? "text-caution" : "text-ink"}>{frame.damaged_volume_percent.toFixed(2)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-spectrum-amber transition-[width]" style={{ width: `${frame.damaged_volume_percent}%` }} /></div><p className="mt-2 text-[10px] leading-4 text-muted">Volume with more than 5% stiffness loss. This is a model damage measure, not a fracture-risk probability.</p></div>
          </section>
          <BoneReconstructionExport frameIndex={frameIndex} frame={frame} firstBreak={firstBreak} onSelectFrame={scrub} onPause={() => setPlaying(false)} />
          <section className="space-y-4 rounded-2xl border border-line bg-surface shadow-card p-5">
            <h3 className="text-sm font-medium">View controls</h3>
            <label className="block text-xs text-muted">Color field<select aria-label="Press color field" value={field} onChange={event => setField(event.target.value as PressField)} className={`${inputStyle} mt-2`}><option value="failure_index">Failure proximity · strain / limit</option><option value="stress_mpa">Von Mises stress · MPa</option><option value="damage">Material damage</option><option value="displacement_mm">Displacement</option><option value="anatomy">Bone surface</option></select></label>
            <p className="text-[11px] leading-5 text-muted">{field === "failure_index" ? "Blue is below the assumed limit; yellow approaches it; red marks damage initiation. Colors use the same strain criterion as the simulated break. Gray regions have failure disabled. This records loading history, not fracture probability." : field === "stress_mpa" ? "Red means high von Mises stress, which does not trigger this model’s break. Select Failure proximity to follow the damage criterion." : "Use Failure proximity to see where the model reaches its damage-initiation limit."}</p>
            <label className="block text-xs text-muted">Deformation display<select aria-label="Deformation magnification" value={scale} onChange={event => setScale(Number(event.target.value))} className={`${inputStyle} mt-2`}><option value={1}>×1 · actual displacement</option><option value={5}>×5 · magnified</option><option value={10}>×10 · magnified</option></select></label>
            <p className="text-[10px] leading-4 text-muted">Magnification affects geometry display only. All reported values and the color scale use actual solved results.</p>
            <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={edges} onChange={event => setEdges(event.target.checked)} className="accent-primary" /> Show element edges</label>
          </section>
          <div className="rounded-2xl border border-line bg-surface shadow-card p-5"><p className="flex items-center gap-2 text-xs text-link"><ArrowDownToLine size={15} /> Head loading · distal fixation</p><p className="mt-2 text-[11px] leading-5 text-muted">A prescribed downward head displacement represents the press fixture. The distal 15 mm is fixed. The frame and hydraulic cylinder are schematic.</p></div>
        </aside>
      </div>
      <section aria-label="Force displacement response" className="mt-5 rounded-2xl border border-line bg-surface shadow-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-medium">Force–stroke response</h3><p className="mt-1 text-[11px] text-muted">Reaction force from each solved step. Stiffness loss changes the response as damage develops.</p></div><span className="font-mono text-[10px] text-link">ACTUAL SOLVER OUTPUT</span></div>
        <div className="h-52 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 8, right: 20, bottom: 16, left: 0 }}><CartesianGrid stroke="#e4dfd5" strokeDasharray="3 4" /><XAxis dataKey="stroke" type="number" domain={[0, "dataMax"]} tickFormatter={value => Number(value).toFixed(2)} tick={{ fill: "#5f6b78", fontSize: 10 }} label={{ value: "Press stroke (mm)", position: "bottom", fill: "#5f6b78", fontSize: 10 }} /><YAxis tick={{ fill: "#5f6b78", fontSize: 10 }} unit=" kN" width={55} /><Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e4dfd5", borderRadius: 8, fontSize: 12 }} labelFormatter={value => `Stroke ${Number(value).toFixed(3)} mm`} formatter={value => [`${Number(value).toFixed(2)} kN`, "Reaction"]} /><ReferenceLine x={model.first_limit_stroke_mm} stroke="#9a5a00" strokeDasharray="4 4" /><Line dataKey="force" stroke="#cdc6b9" strokeDasharray="4 4" dot={false} isAnimationActive={false} /><Line dataKey="completed" stroke="#2546b8" strokeWidth={2} dot={{ r: 2, fill: "#2546b8" }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
        <p className="mt-2 text-[10px] text-muted">Amber line: first assumed strain limit reached in the eligible material. Scrubbing replays the same loading history; it does not simulate unloading or healing.</p>
      </section>
      <details className="mt-5 rounded-2xl border border-line bg-surface shadow-card p-5 text-xs text-muted" open>
        <summary className="cursor-pointer font-medium text-ink">How to interpret the failure visualization</summary>
        <p className="mt-3 leading-6">Damage uses volume-weighted strain averaged within {model.strain_averaging_radius_mm} mm of each element center to reduce sensitivity to very small elements.</p>
        <p className="mt-3 leading-6">Failure proximity uses the historical maximum of tensile principal strain / {(model.tensile_strain_limit * 100).toFixed(2)}% and compressive principal strain / {(model.compressive_strain_limit * 100).toFixed(2)}%. Each surface face displays its owning element’s ratio, without spreading a neighboring element’s value across it. Red starts at 1; gray marks fixture regions where failure is disabled. Reaching this limit starts damage, while a visible gap requires further degradation. Von Mises stress is a separate field and is not the failure criterion.</p>
        <div className="mt-3 grid gap-4 leading-6 md:grid-cols-2"><div><p>The model reduces element stiffness irreversibly after principal strain exceeds an assumed limit: {(model.tensile_strain_limit * 100).toFixed(2)}% in tension or {(model.compressive_strain_limit * 100).toFixed(2)}% in compression. Material uses E = {model.youngs_modulus_mpa / 1000} GPa and ν = {model.poisson_ratio}.</p><p className="mt-2">At 95% damage, elements are hidden to expose the weakened region. The solver retains a small residual stiffness. The visible gap is an element-erosion illustration, not a validated crack path or fragment-contact simulation.</p></div><div><p>Patient geometry alone is insufficient for early fracture detection. This demonstration has no CT-density calibration, mesh-convergence validation, contact solve, or calibrated fracture-energy model. High strains close to the fixtures are excluded from damage initiation.</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-link"><a href={`${PRESS_PATH}/manifest.json`} download className="hover:underline">Download simulation report</a><a href={model.source_url} target="_blank" rel="noreferrer" className="hover:underline">Dataset & attribution</a><a href="https://www.jove.com/t/64947/imaging-of-the-microstructural-failure-mechanism-in-the-human-hip" target="_blank" rel="noreferrer" className="hover:underline">Strain-limit reference</a></div></div></div>
      </details>
    </>}
  </div>;
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div><p className="text-[10px] text-muted">{label}</p><p className="mt-1 font-mono text-xl tracking-tight text-ink">{value}<span className="ml-1 text-[10px] text-muted">{unit}</span></p></div>;
}
