"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Download, Maximize2, RotateCcw } from "lucide-react";
import type vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";

type Field = "stress" | "displacement" | "anatomy";
type ModelInfo = {
  dataset: string;
  case_id: string;
  anatomy: string;
  source_url: string;
  slicer_version: string;
  metrics: {
    solver: string; nodes: number; elements: number; load_newtons: number;
    youngs_modulus_mpa: number; poisson_ratio: number;
    max_von_mises_mpa: number; max_nodal_von_mises_mpa: number; max_displacement_mm: number;
  };
};
type Controls = { reset: () => void; update: (field: Field, edges: boolean, clip: number) => void };
const MODEL_PATH = "/models/hfvalid-femur";

export function BoneViewer() {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const [field, setField] = useState<Field>("anatomy");
  const [edges, setEdges] = useState(false);
  const [clip, setClip] = useState(0);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    setError(null);
    setModel(null);
    async function initialize() {
      try {
        await import("@kitware/vtk.js/Rendering/Profiles/Geometry");
        const [{ default: GenericRenderWindow }, { default: Actor }, { default: Mapper },
          { default: Reader }, { default: ColorTransferFunction }, { default: Plane }] = await Promise.all([
          import("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"),
          import("@kitware/vtk.js/Rendering/Core/Actor"),
          import("@kitware/vtk.js/Rendering/Core/Mapper"),
          import("@kitware/vtk.js/IO/XML/XMLPolyDataReader"),
          import("@kitware/vtk.js/Rendering/Core/ColorTransferFunction"),
          import("@kitware/vtk.js/Common/DataModel/Plane"),
        ]);
        const [infoResponse, meshResponse] = await Promise.all([
          fetch(`${MODEL_PATH}/manifest.json`, { signal: abort.signal }),
          fetch(`${MODEL_PATH}/fea-surface.vtp`, { signal: abort.signal }),
        ]);
        if (!infoResponse.ok || !meshResponse.ok) throw new Error("The FEA model could not be loaded. Please retry.");
        const info = await infoResponse.json() as ModelInfo;
        const meshBuffer = await meshResponse.arrayBuffer();
        if (disposed || !containerRef.current) return;
        const reader = Reader.newInstance();
        reader.parseAsArrayBuffer(meshBuffer);
        const data = reader.getOutputData(0) as vtkPolyData;
        if (!data?.getNumberOfPoints() || !data.getPointData().getArrayByName("von_mises_nodal_mpa") || !data.getPointData().getArrayByName("displacement_mm")) {
          reader.delete();
          throw new Error("The model is missing its solved stress or displacement field.");
        }
        const view = GenericRenderWindow.newInstance({ background: [0, 0, 0], listenWindowResize: false });
        const actor = Actor.newInstance();
        const mapper = Mapper.newInstance();
        const colors = ColorTransferFunction.newInstance();
        const plane = Plane.newInstance({ normal: [-1, 0, 0] });
        const observer = new ResizeObserver(() => {
          view.resize();
          // Refit to the new aspect ratio while preserving the viewing angle.
          renderer.resetCamera();
          renderer.resetCameraClippingRange();
          view.getRenderWindow().render();
        });
        cleanup = () => {
          observer.disconnect();
          view.delete(); actor.delete(); mapper.delete(); colors.delete(); plane.delete(); reader.delete();
        };
        view.setContainer(containerRef.current);
        mapper.setInputData(data);
        mapper.setLookupTable(colors);
        mapper.setColorModeToMapScalars();
        actor.setMapper(mapper);
        actor.getProperty().setAmbient(0.22);
        actor.getProperty().setDiffuse(0.78);
        actor.getProperty().setSpecular(0.12);
        actor.getProperty().setSpecularPower(24);
        actor.getProperty().setInterpolationToPhong();
        actor.getProperty().setEdgeColor(0.08, 0.13, 0.19);
        actor.getProperty().setColor(0.9, 0.88, 0.82);
        const renderer = view.getRenderer();
        renderer.addActor(actor);
        const bounds = data.getBounds();
        const center = [(bounds[0] + bounds[1]) / 2, (bounds[2] + bounds[3]) / 2, (bounds[4] + bounds[5]) / 2];
        const reset = () => {
          const camera = renderer.getActiveCamera();
          camera.setViewAngle(30);
          camera.setFocalPoint(center[0], center[1], center[2]);
          camera.setPosition(center[0] + 70, center[1] - 700, center[2] + 15);
          camera.setViewUp(0, 0, 1);
          renderer.resetCamera();
          renderer.resetCameraClippingRange();
          view.getRenderWindow().render();
        };
        const update: Controls["update"] = (nextField, nextEdges, nextClip) => {
          actor.getProperty().setEdgeVisibility(nextEdges);
          mapper.setScalarVisibility(nextField !== "anatomy");
          const max = nextField === "stress" ? info.metrics.max_nodal_von_mises_mpa : info.metrics.max_displacement_mm;
          colors.removeAllPoints();
          colors.addRGBPoint(0, 0.16, 0.3, 0.85);
          colors.addRGBPoint(max * 0.25, 0.1, 0.8, 0.9);
          colors.addRGBPoint(max * 0.5, 0.35, 0.9, 0.55);
          colors.addRGBPoint(max * 0.75, 1, 0.8, 0.2);
          colors.addRGBPoint(max, 0.95, 0.24, 0.19);
          mapper.setScalarRange(0, max);
          if (nextField === "stress") {
            mapper.setScalarModeToUsePointFieldData();
            mapper.setColorByArrayName("von_mises_nodal_mpa");
          } else if (nextField === "displacement") {
            mapper.setScalarModeToUsePointFieldData();
            mapper.setColorByArrayName("displacement_mm");
          }
          mapper.removeAllClippingPlanes();
          if (nextClip > 0) {
            plane.setOrigin(bounds[1] - (bounds[1] - bounds[0]) * nextClip / 100, center[1], center[2]);
            mapper.addClippingPlane(plane);
          }
          view.getRenderWindow().render();
        };
        controlsRef.current = { reset, update };
        observer.observe(containerRef.current);
        view.resize();
        reset();
        setModel(info);
        setStatus("ready");
      } catch (cause) {
        if (disposed) return;
        cleanup?.(); cleanup = undefined;
        controlsRef.current = null;
        setError(cause instanceof Error ? cause.message : "WebGL could not initialize on this device.");
        setStatus("error");
      }
    }
    void initialize();
    return () => { disposed = true; abort.abort(); controlsRef.current = null; cleanup?.(); };
  }, [attempt]);

  useEffect(() => {
    if (status === "ready") controlsRef.current?.update(field, edges, clip);
  }, [field, edges, clip, status]);

  async function maximize() {
    try {
      if (document.fullscreenElement === sectionRef.current) await document.exitFullscreen();
      else await sectionRef.current?.requestFullscreen();
    } catch { setError("Fullscreen is unavailable in this browser. Rotation and zoom remain available."); }
  }
  const maximum = field === "stress" ? model?.metrics.max_nodal_von_mises_mpa : model?.metrics.max_displacement_mm;
  const buttonClass = "rounded-lg border border-line bg-panel px-3 py-2 text-xs text-muted transition hover:text-ink disabled:opacity-40";

  return (
    <section ref={sectionRef} aria-label="Interactive bone finite element visualization" className="overflow-hidden rounded-xl border border-line bg-[#0a121b] shadow-glow [&:fullscreen]:flex [&:fullscreen]:flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div><h3 className="flex items-center gap-2 text-sm font-medium"><Box size={16} className="text-cyan" /> Femur · finite element analysis</h3><p className="mt-1 text-[10px] text-muted">{model ? `${model.dataset} ${model.case_id} · ${model.anatomy}` : "Loading the complete femur"}</p></div>
        <div className="flex items-center gap-2">
          <select aria-label="Displayed FEA field" value={field} disabled={status !== "ready"} onChange={event => setField(event.target.value as Field)} className={`${buttonClass} max-w-[170px]`}><option value="anatomy">Bone surface</option><option value="stress">FEA · von Mises stress</option><option value="displacement">FEA · displacement</option></select>
          <button disabled={status !== "ready"} onClick={() => { controlsRef.current?.reset(); setClip(0); }} className={buttonClass} aria-label="Reset bone view"><RotateCcw size={15} /></button>
          <button onClick={maximize} className={buttonClass} aria-label="Toggle viewer fullscreen"><Maximize2 size={15} /></button>
        </div>
      </div>
      <div className="relative min-h-[420px] flex-1 sm:min-h-[490px]">
        <div ref={containerRef} role="img" aria-label="Interactive complete femur with bone surface and computed FEA views" className="absolute inset-0 touch-none" />
        {status === "ready" && model && <>
          <p className="pointer-events-none absolute bottom-4 left-4 right-4 text-center text-[10px] text-muted">Drag to rotate · Scroll / pinch to zoom · Shift + drag to pan</p>
        </>}
        {status === "loading" && <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#0a121b] text-sm text-muted"><span className="mr-3 h-3 w-3 animate-pulse rounded-full bg-cyan" />Loading solved bone mesh…</div>}
        {status === "error" && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a121b] p-8 text-center"><p className="max-w-sm text-sm text-warning">{error}</p><button className={buttonClass} onClick={() => setAttempt(value => value + 1)}>Retry model</button></div>}
      </div>
      {status === "ready" && model && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <div><p className="font-mono text-[10px] text-cyan">{field === "anatomy" ? "CT-DERIVED FEMUR" : `${model.metrics.solver.toUpperCase()} · SOLVED`}</p><p className="mt-1 text-[10px] text-muted">{field === "anatomy" ? "Select an FEA view to inspect stress or displacement" : `${model.metrics.elements.toLocaleString()} tetrahedra · ${model.metrics.load_newtons} N compression`}</p></div>
        {field !== "anatomy" && <div><p className="text-[10px] text-ink">{field === "stress" ? "Nodal von Mises stress · MPa" : "Displacement magnitude · mm"}</p><div className="mt-2 h-2 w-44 rounded-full bg-[linear-gradient(to_right,#294dd9,#1acce6,#59e68c,#ffcc33,#f23d30)]" /><div className="mt-1 flex justify-between font-mono text-[10px] text-muted"><span>0</span><span>{maximum?.toPrecision(4)}</span></div></div>}
      </div>}
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={edges} disabled={status !== "ready"} onChange={event => setEdges(event.target.checked)} className="accent-cyan" /> Show mesh</label>
        <label className="flex min-w-44 flex-1 items-center gap-3 text-xs text-muted">Clip<input type="range" min="0" max="95" value={clip} disabled={status !== "ready"} onChange={event => setClip(Number(event.target.value))} aria-label="Bone clipping percentage" className="min-w-16 flex-1 accent-cyan" /><span className="w-7 font-mono text-[10px]">{clip}%</span></label>
        {model && <a className="flex items-center gap-1.5 text-xs text-cyan hover:underline" href={`${MODEL_PATH}/bone-fea.vtu`} download><Download size={14} /> FEA mesh</a>}
      </div>
      {model && <details className="border-t border-line px-4 py-3 text-[11px] text-muted">
        <summary className="cursor-pointer text-ink">Model, load & provenance</summary>
        <div className="mt-3 space-y-2 leading-5">
          <p>Complete patient-derived femur from HFValid, processed in 3D Slicer {model.slicer_version}. The tetrahedral mesh follows the Slicer surface: {model.metrics.elements.toLocaleString()} elements and {model.metrics.nodes.toLocaleString()} nodes. Smooth lighting does not move the mesh or alter stress values.</p>
          <p>Distal 15 mm fixed in all directions; {model.metrics.load_newtons} N distributed over the superior femoral-head surface in −Z. Homogeneous, isotropic linear elasticity: E = {model.metrics.youngs_modulus_mpa / 1000} GPa, ν = {model.metrics.poisson_ratio}. Undeformed geometry; FEA colors show solved values.</p>
          <p>Stress contours use volume-weighted nodal averages. The download retains raw element stresses, with a peak of {model.metrics.max_von_mises_mpa.toFixed(2)} MPa.</p>
          <p>Research example with assumed material and loading, without mesh-convergence or clinical validation. Nearby dashboard cards and history are separate demo data.</p>
          <p>HFValid: Aldieri, La Mattina, Szyszko, Baruffaldi & Viceconti (2025), University of Bologna · CC BY 4.0.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-cyan"><a href={model.source_url} target="_blank" rel="noreferrer" className="hover:underline">CT dataset & attribution</a><a href={`${MODEL_PATH}/bone.seg.nrrd`} download className="hover:underline">Slicer segmentation</a><a href={`${MODEL_PATH}/manifest.json`} download className="hover:underline">Solver report</a></div>
        </div>
      </details>}
      {error && status === "ready" && <p role="status" className="px-4 pb-3 text-xs text-warning">{error}</p>}
    </section>
  );
}
