"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRESS_PATH, pressStage, type PressModel } from "@/lib/press-model";

type Manifest = PressModel & {
  dataset?: string;
  anatomy?: string;
  method?: string;
  damage_law?: string;
  limitations?: string[];
  license?: string;
  strain_limit_reference?: string;
  elastic_stiffness_n_per_mm?: number;
};

const fmt = (value: number, digits = 2) => value.toLocaleString("en-CA", { maximumFractionDigits: digits, minimumFractionDigits: digits });

// A printable summary of the precomputed press simulation, built from the same manifest the 3D view loads.
export default function PressReportPage() {
  const [model, setModel] = useState<Manifest | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${PRESS_PATH}/manifest.json`).then(r => (r.ok ? r.json() : Promise.reject())).then(setModel).catch(() => setError(true));
  }, []);

  if (error) return <main className="mx-auto max-w-3xl p-8 text-slate-900">The simulation data could not be loaded. <Link href="/physics-simulations" className="underline">Back to Physics simulations</Link></main>;
  if (!model) return <main className="mx-auto max-w-3xl p-8 text-slate-600">Loading the simulation report…</main>;

  const last = model.frames[model.frames.length - 1];
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <article className="mx-auto max-w-4xl space-y-6 px-6 py-10 text-[14px] leading-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/physics-simulations" className="text-blue-700 underline underline-offset-4">← Back to Physics simulations</Link>
          <div className="flex gap-3">
            <a href={`${PRESS_PATH}/manifest.json`} target="_blank" rel="noreferrer" className="text-blue-700 underline underline-offset-4">Raw data (JSON)</a>
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-white">Print or save as PDF</button>
          </div>
        </div>

        <header className="space-y-1 border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Rainbone · simulation report</p>
          <h1 className="font-serif text-3xl font-semibold">{model.title}</h1>
          <p className="text-slate-600">{model.dataset ?? "HFValid"} {model.case_id} · {model.anatomy ?? "femur"} · {model.solver} · {model.nodes.toLocaleString("en-CA")} nodes · {model.elements.toLocaleString("en-CA")} tetrahedra</p>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">Research demonstration with assumed material and failure properties, not a validated clinical test and not a medical device.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <div><h2 className="font-semibold">Material (assumed)</h2><p>E = {model.youngs_modulus_mpa / 1000} GPa, ν = {model.poisson_ratio}</p></div>
          <div><h2 className="font-semibold">Strain limits (assumed)</h2><p>{fmt(model.tensile_strain_limit * 100)} % tension · {fmt(model.compressive_strain_limit * 100)} % compression, averaged within {model.strain_averaging_radius_mm} mm</p></div>
          <div><h2 className="font-semibold">First strain limit reached</h2><p>at {fmt(model.first_limit_stroke_mm)} mm of head displacement</p></div>
          {model.elastic_stiffness_n_per_mm !== undefined && <div><h2 className="font-semibold">Elastic stiffness</h2><p>{fmt(model.elastic_stiffness_n_per_mm, 0)} N/mm</p></div>}
          <div><h2 className="font-semibold">Final step</h2><p>{fmt(last.stroke_mm)} mm stroke, {fmt(last.load_n / 1000)} kN load, {fmt(last.eroded_volume_percent)} % of volume hidden as eroded</p></div>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Compression steps</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-[13px] tabular-nums">
              <thead><tr className="border-b border-slate-300 text-slate-600">
                <th className="py-1 text-left">Step</th><th>Stroke (mm)</th><th>Load (kN)</th><th>Peak displacement (mm)</th><th>Peak strain / limit</th><th>Damaged volume (%)</th><th className="text-left pl-3">Stage</th>
              </tr></thead>
              <tbody>{model.frames.map((frame, i) => (
                <tr key={frame.file} className="border-b border-slate-100">
                  <td className="py-1 text-left">{i + 1}</td><td>{fmt(frame.stroke_mm)}</td><td>{fmt((frame.load_n || 0) / 1000)}</td><td>{fmt(frame.max_displacement_mm)}</td><td>{fmt(frame.max_failure_index)}</td><td>{fmt(frame.damaged_volume_percent)}</td><td className="pl-3 text-left">{pressStage(frame)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        {model.method && <section><h2 className="font-semibold">Method</h2><p>{model.method}</p></section>}
        {model.damage_law && <section><h2 className="font-semibold">Damage law</h2><p className="font-mono text-[12px]">{model.damage_law}</p></section>}
        {model.limitations && <section><h2 className="font-semibold">Limitations</h2><ul className="list-disc space-y-1 pl-5">{model.limitations.map(item => <li key={item}>{item}</li>)}</ul></section>}

        <footer className="space-y-1 border-t border-slate-200 pt-4 text-slate-600">
          {model.license && <p>Data: {model.license}. <a href={model.source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">Dataset</a>{model.strain_limit_reference && <> · <a href={model.strain_limit_reference} target="_blank" rel="noreferrer" className="text-blue-700 underline">Strain-limit reference</a></>}</p>}
          <p>Generated from the precomputed SfePy run shown at rainbone.health/physics-simulations.</p>
        </footer>
      </article>
    </main>
  );
}
