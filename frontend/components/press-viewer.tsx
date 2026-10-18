"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import type vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import { BONE, DATA_RAMP, VIEWPORT_BACKGROUND } from "@/lib/spectrum";
import { PRESS_PATH, type PressField, type PressModel } from "@/lib/press-model";

type Controls = { reset: () => void; update: (frame: number, field: PressField, scale: number, edges: boolean) => Promise<void> };

function updateDisplayNormals(data: vtkPolyData) {
  const points = data.getPoints().getData();
  const faces = data.getPolys().getData();
  const array = data.getPointData().getNormals();
  if (!array) return;
  const normals = array.getData();
  normals.fill(0);
  // Exported surfaces contain triangles. Recompute area-weighted normals
  // after magnification so lighting follows the displayed geometry.
  for (let i = 0; i < faces.length; i += 4) {
    const a = faces[i + 1] * 3, b = faces[i + 2] * 3, c = faces[i + 3] * 3;
    const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2];
    const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const id of [a, b, c]) { normals[id] += nx; normals[id + 1] += ny; normals[id + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  array.modified();
}

export function PressViewer({ model, frameIndex, field, scale, edges, playing, onTogglePlayback, onRestart, onScrub, onReady }: {
  model: PressModel; frameIndex: number; field: PressField; scale: number; edges: boolean;
  playing: boolean; onTogglePlayback: () => void; onRestart: () => void; onScrub: (index: number) => void; onReady: (ready: boolean) => void;
}) {
  const section = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === section.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const abort = new AbortController();
    setReady(false); setLoading(true); setError(null); onReadyRef.current(false);
    async function initialize() {
      try {
        await import("@kitware/vtk.js/Rendering/Profiles/Geometry");
        const [{ default: Window }, { default: Actor }, { default: Mapper }, { default: Reader },
          { default: Colors }, { default: Cube }, { default: Cylinder }, { default: DataArray }] = await Promise.all([
          import("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"), import("@kitware/vtk.js/Rendering/Core/Actor"),
          import("@kitware/vtk.js/Rendering/Core/Mapper"), import("@kitware/vtk.js/IO/XML/XMLPolyDataReader"),
          import("@kitware/vtk.js/Rendering/Core/ColorTransferFunction"), import("@kitware/vtk.js/Filters/Sources/CubeSource"),
          import("@kitware/vtk.js/Filters/Sources/CylinderSource"),
          import("@kitware/vtk.js/Common/Core/DataArray"),
        ]);
        if (disposed || !container.current) return;
        const view = Window.newInstance({ background: VIEWPORT_BACKGROUND, listenWindowResize: false });
        const renderer = view.getRenderer();
        const render = () => view.getRenderWindow().render();
        const objects: { delete: () => void }[] = [];
        const colors = Colors.newInstance();
        const bone = Actor.newInstance();
        const mapper = Mapper.newInstance();
        bone.setMapper(mapper);
        bone.getProperty().setColor(...BONE);
        bone.getProperty().setAmbient(.25);
        bone.getProperty().setDiffuse(.75);
        bone.getProperty().setSpecular(.12);
        bone.getProperty().setInterpolationToPhong();
        bone.getProperty().setEdgeColor(.04, .08, .10);
        mapper.setLookupTable(colors); mapper.setColorModeToMapScalars(); mapper.setScalarModeToUsePointFieldData();
        let boneAdded = false;
        objects.push(bone, mapper, colors);
        view.setContainer(container.current);

        function block(center: [number, number, number], lengths: [number, number, number], color: [number, number, number]) {
          const source = Cube.newInstance({ center, xLength: lengths[0], yLength: lengths[1], zLength: lengths[2] });
          const actor = Actor.newInstance(); const mesh = Mapper.newInstance();
          mesh.setInputConnection(source.getOutputPort()); actor.setMapper(mesh);
          actor.getProperty().setColor(...color); actor.getProperty().setSpecular(.4); actor.getProperty().setSpecularPower(35);
          renderer.addActor(actor); objects.push(source, mesh, actor); return actor;
        }
        function cylinder(center: [number, number, number], radius: number, height: number, color: [number, number, number]) {
          const source = Cylinder.newInstance({ center, radius, height, resolution: 48, direction: [0, 0, 1] });
          const actor = Actor.newInstance(); const mesh = Mapper.newInstance();
          mesh.setInputConnection(source.getOutputPort()); actor.setMapper(mesh);
          actor.getProperty().setColor(...color); actor.getProperty().setSpecular(.55); actor.getProperty().setSpecularPower(50);
          renderer.addActor(actor); objects.push(source, mesh, actor); return actor;
        }
        const [xmin, ymin, zmin, xmax, ymax, zmax] = model.bounds;
        const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
        const [hx, hy] = model.head_center;
        const steel: [number, number, number] = [.28, .35, .42];
        const chrome: [number, number, number] = [.55, .65, .72];
        // A schematic frame, distal potting block and self-aligning head shoe.
        block([cx, cy, zmin - 20], [230, 130, 24], steel);
        block([cx, cy, zmin + 4], [105, 80, 24], [.18, .25, .30]);
        block([cx, cy, zmax + 106], [230, 110, 22], steel);
        for (const x of [cx - 100, cx + 100]) cylinder([x, cy + 35, (zmin + zmax + 80) / 2], 7, zmax - zmin + 110, chrome);
        const housing = cylinder([hx, hy, zmax + 66], 24, 60, [.09, .2, .36]);
        const piston = cylinder([hx, hy, zmax + 52], 12, 80, chrome);
        const platen = cylinder([hx, hy, zmax + 6], 29, 12, chrome);
        const frames = new Map<number, { reader: ReturnType<typeof Reader.newInstance>; data: vtkPolyData; original: Float32Array }>();
        const requests = new Map<number, Promise<void>>();
        async function loadFrame(index: number) {
          if (frames.has(index)) return;
          if (requests.has(index)) return requests.get(index);
          const request = (async () => {
            const response = await fetch(`${PRESS_PATH}/${model.frames[index].file}`, { signal: abort.signal });
            if (!response.ok) throw new Error("The compression step could not be loaded.");
            const buffer = await response.arrayBuffer();
            if (disposed) return;
            const reader = Reader.newInstance();
            reader.parseAsArrayBuffer(buffer);
            const data = reader.getOutputData(0) as vtkPolyData;
            if (!data?.getNumberOfPoints() || !["displacement", "displacement_mm", "stress_mpa", "damage", "failure_index"].every(name => data.getPointData().getArrayByName(name)) || !["element_failure_index", "element_failure_eligible"].every(name => data.getCellData().getArrayByName(name))) {
              reader.delete(); throw new Error("This step is missing its solved mechanical fields.");
            }
            const failure = data.getCellData().getArrayByName("element_failure_index")!.getData();
            const eligible = data.getCellData().getArrayByName("element_failure_eligible")!.getData();
            // Color each face by the element that owns it. The negative value
            // is a display-only gray mask; original solved fields stay intact.
            const display = Float32Array.from(failure, (value, i) => eligible[i] ? value : -1);
            data.getCellData().addArray(DataArray.newInstance({ name: "failure_display", values: display, numberOfComponents: 1 }));
            frames.set(index, { reader, data, original: new Float32Array(data.getPoints().getData()) });
          })();
          requests.set(index, request);
          try { await request; } finally { requests.delete(index); }
        }
        const reset = () => {
          const camera = renderer.getActiveCamera();
          camera.setViewAngle(30); camera.setViewUp(0, 0, 1);
          camera.setFocalPoint(cx, cy, (zmin + zmax) / 2 + 35);
          camera.setPosition(cx + 250, cy - 1100, (zmin + zmax) / 2 + 95);
          renderer.resetCamera(); renderer.resetCameraClippingRange(); render();
        };
        let requestId = 0;
        const update: Controls["update"] = async (index, nextField, amplification, showEdges) => {
          const id = ++requestId;
          setLoading(true); setError(null); onReadyRef.current(false);
          try {
            await loadFrame(index);
            if (disposed || id !== requestId) return;
            const frame = frames.get(index)!;
            const displacement = frame.data.getPointData().getArrayByName("displacement")!.getData();
            const coordinates = frame.data.getPoints().getData() as Float32Array;
            const motion = model.frames[index].head_motion_mm;
            for (let i = 0; i < coordinates.length; i++) coordinates[i] = frame.original[i] + displacement[i] * amplification;
            housing.setPosition(motion[0] * amplification, motion[1] * amplification, 0);
            platen.setPosition(motion[0] * amplification, motion[1] * amplification, motion[2] * amplification);
            piston.setPosition(motion[0] * amplification, motion[1] * amplification, motion[2] * amplification);
            frame.data.getPoints().modified(); frame.data.modified();
            updateDisplayNormals(frame.data);
            mapper.setInputData(frame.data);
            if (!boneAdded) { renderer.addActor(bone); boneAdded = true; }
            const showFailure = nextField === "failure_index";
            if (showFailure) mapper.setScalarModeToUseCellFieldData();
            else mapper.setScalarModeToUsePointFieldData();
            mapper.setScalarVisibility(nextField !== "anatomy"); mapper.setColorByArrayName(showFailure ? "failure_display" : nextField);
            bone.getProperty().setEdgeVisibility(showEdges);
            // Fixed range across every step: changing colors indicates changing
            // magnitude, not automatic rescaling of the color legend.
            const maximum = nextField === "damage" || nextField === "failure_index" ? 1 : nextField === "displacement_mm" ? Math.max(...model.frames.map(f => f.max_displacement_mm)) : model.stress_color_max_mpa;
            colors.removeAllPoints();
            if (showFailure) {
              colors.addRGBPoint(-1, .45, .49, .55);
              colors.addRGBPoint(0, ...DATA_RAMP[0]);
              colors.addRGBPoint(.5, ...DATA_RAMP[1]);
              colors.addRGBPoint(.75, ...DATA_RAMP[3]);
              // The preceding Float32 value stays amber: red is reserved
              // for elements whose stored failure ratio actually reaches 1.
              colors.addRGBPoint(1 - 2 ** -24, ...DATA_RAMP[3]);
            } else {
              DATA_RAMP.slice(0, -1).forEach((rgb, i) => colors.addRGBPoint(maximum * i / (DATA_RAMP.length - 1), ...rgb));
            }
            colors.addRGBPoint(maximum, ...DATA_RAMP[DATA_RAMP.length - 1]); mapper.setScalarRange(showFailure ? -1 : 0, maximum);
            renderer.resetCameraClippingRange(); render();
            setLoading(false); onReadyRef.current(true);
            if (index + 1 < model.frames.length) void loadFrame(index + 1).catch(() => {});
          } catch (cause) {
            if (disposed || id !== requestId) return;
            setError(cause instanceof Error ? cause.message : "Could not render this step.");
            setLoading(false); onReadyRef.current(false);
          }
        };
        const observer = new ResizeObserver(() => { view.resize(); renderer.resetCamera(); renderer.resetCameraClippingRange(); render(); });
        cleanup = () => {
          observer.disconnect(); view.delete(); objects.forEach(object => object.delete());
          frames.forEach(frame => frame.reader.delete()); frames.clear();
        };
        controls.current = { reset, update };
        observer.observe(container.current); view.resize(); reset();
        setReady(true);
      } catch (cause) {
        if (disposed) return;
        cleanup?.(); cleanup = undefined; controls.current = null;
        setError(cause instanceof Error ? cause.message : "WebGL is unavailable."); setLoading(false);
      }
    }
    void initialize();
    return () => { disposed = true; abort.abort(); controls.current = null; cleanup?.(); };
  }, [model, attempt]);

  useEffect(() => { if (ready) void controls.current?.update(frameIndex, field, scale, edges); }, [frameIndex, field, scale, edges, ready]);
  const maximum = field === "damage" || field === "failure_index" ? 1 : field === "displacement_mm" ? Math.max(...model.frames.map(f => f.max_displacement_mm)) : model.stress_color_max_mpa;
  const atEnd = frameIndex === model.frames.length - 1;
  const frame = model.frames[frameIndex];
  const canPlay = ready && !loading && !error;
  async function fullscreen() {
    try {
      if (document.fullscreenElement === section.current) await document.exitFullscreen();
      else await section.current?.requestFullscreen();
    } catch { setError("Fullscreen is unavailable. The inline viewer remains interactive."); }
  }
  return <section ref={section} aria-label="Hydraulic press 3D simulation" className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card [&:fullscreen]:h-[100dvh] [&:fullscreen]:rounded-none">
    <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-medium">{isFullscreen ? "FEA compression" : field === "failure_index" ? "Failure proximity · strain / limit" : "Hydraulic compression rig"}</p><p className="mt-1 font-mono text-[10px] text-muted">HFValid {model.case_id} · FEA step {frameIndex + 1}/{model.frames.length} · {isFullscreen ? `${frame.stroke_mm.toFixed(3)} mm applied displacement` : `${model.elements.toLocaleString()} elements`}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {isFullscreen && <div role="group" aria-label="Fullscreen playback controls" className="flex items-center gap-2">
            <button aria-label="Previous compression step" disabled={frameIndex === 0} onClick={() => onScrub(frameIndex - 1)} className="rounded-lg border border-line p-2 text-muted hover:text-ink disabled:opacity-30"><ChevronLeft size={16} /></button>
            <button aria-label={playing ? "Pause fullscreen simulation" : atEnd ? "Replay fullscreen simulation" : "Play fullscreen simulation"} disabled={!canPlay && !playing} onClick={onTogglePlayback} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause" : atEnd ? "Replay" : "Run press"}</button>
            <button aria-label="Next compression step" disabled={atEnd} onClick={() => onScrub(frameIndex + 1)} className="rounded-lg border border-line p-2 text-muted hover:text-ink disabled:opacity-30"><ChevronRight size={16} /></button>
            <button aria-label="Restart fullscreen simulation" disabled={!canPlay} onClick={onRestart} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink disabled:opacity-40"><RotateCcw size={15} />Restart</button>
          </div>}
          <button aria-label="Reset press camera" title="Reset camera" onClick={() => controls.current?.reset()} className="rounded-lg border border-line p-2 text-muted hover:text-ink"><RotateCcw size={15} /></button>
          <button aria-label={isFullscreen ? "Exit fullscreen press viewer" : "Fullscreen press viewer"} onClick={fullscreen} className="rounded-lg border border-line p-2 text-muted hover:text-ink">{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        </div>
      </div>
      {isFullscreen && <div className="mt-3">
        <input aria-label="Compression step" type="range" min={0} max={model.frames.length - 1} step={1} value={frameIndex} onChange={event => onScrub(Number(event.target.value))} className="w-full accent-primary" />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted"><span>UNLOADED</span><span>COMPRESSION → DAMAGE</span></div>
      </div>}
    </div>
    <div className={`relative flex-1 bg-viewport ${isFullscreen ? "min-h-0" : "min-h-[400px] sm:min-h-[500px]"}`}>
      <div ref={container} role="img" aria-label="Rotatable femur between a hydraulic ram and distal support" className="absolute inset-0 touch-none" />
      <div className="pointer-events-none absolute left-4 top-3 rounded-md border border-viewport-line bg-viewport/85 px-2 py-1 font-mono text-[10px] text-viewport-ink">DEFORMATION ×{scale} · VISUAL SCALE</div>
      {field === "failure_index" && <div className="pointer-events-none absolute left-4 top-11 max-w-[240px] rounded-md border border-viewport-line bg-viewport/85 px-2 py-1.5 text-[10px] leading-4"><p className="text-[#ff8a78]">Red: damage-initiation limit reached</p><p className="text-viewport-ink">Gray: failure disabled near fixtures</p></div>}
      {loading && <p role="status" className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-surface/90 px-4 py-2 text-xs text-link">Loading solved step…</p>}
      {error && <div role="alert" className="absolute inset-x-4 bottom-12 rounded-lg border border-caution/30 bg-surface p-4 text-sm text-caution"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)} className="mt-2 underline">Retry press viewer</button></div>}
      <p className="pointer-events-none absolute inset-x-3 bottom-3 text-center text-[11px] text-viewport-ink/70">Drag to rotate · Scroll to zoom · Shift + drag to pan</p>
    </div>
    <div className={`shrink-0 border-t border-line bg-surface text-muted ${isFullscreen ? "grid grid-cols-1 items-center gap-x-10 gap-y-4 px-8 py-5 text-xs md:grid-cols-[1fr_minmax(0,560px)_1fr]" : "flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[10px]"}`}>
      <p>Precomputed SfePy steps · displacement-controlled test</p>
      {field !== "anatomy" && <div className={isFullscreen ? "w-full" : "w-72 max-w-full"}>
        <p className={isFullscreen ? "mb-2 text-center font-medium text-ink" : ""}>{field === "failure_index" ? "Failure proximity · peak principal strain / assumed limit" : field === "stress_mpa" ? "Nodal von Mises stress · MPa" : field === "damage" ? "Damage · 0 intact / 1 fully degraded" : "Displacement magnitude · mm"}</p>
        <div className={`relative mt-1.5 w-full rounded-full ${isFullscreen ? "h-2.5" : "h-1.5"} ${field === "failure_index" ? "bg-[linear-gradient(to_right,#2f4fd8_0%,#12a0c4_50%,#f0b429_75%,#f0b429_100%)]" : "bg-[linear-gradient(to_right,#2f4fd8,#12a0c4,#3baa6e,#f0b429,#d9412b)]"}`}>{field === "failure_index" && <span className={`absolute right-0 rounded-r-full bg-spectrum-red ${isFullscreen ? "h-2.5 w-2" : "h-1.5 w-1.5"}`} />}</div>
        <div className="mt-1 grid grid-cols-3 font-mono"><span>0</span><span className="text-center">{field === "failure_index" ? "0.5" : ""}</span><span className="text-right">{field === "failure_index" ? "≥ 1" : `${field === "stress_mpa" ? "≥ " : ""}${maximum.toFixed(field === "damage" ? 1 : 2)}`}</span></div>
        {field === "failure_index" && <div className="flex justify-between"><span>Below limit</span><span className="text-critical">Limit reached</span></div>}
        {field === "stress_mpa" && <p className={isFullscreen ? "mt-2 text-center" : "mt-1"}>Fixed 99th-percentile cap · red is not a failure threshold</p>}
        {field === "failure_index" && !isFullscreen && <><p className="mt-2 flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#737d8c]" />Gray: failure disabled near fixtures</p><p className="mt-1">Same element criterion as the damage model.<br />Records loading history, not fracture probability.</p></>}
      </div>}
      {isFullscreen && field === "failure_index" && <div className="space-y-1.5 md:justify-self-end md:text-right"><p className="flex items-center gap-1.5 md:justify-end"><span className="h-2.5 w-2.5 rounded-sm bg-[#737d8c]" />Gray: failure disabled near fixtures</p><p>Same element criterion as the damage model.</p><p>Records loading history, not fracture probability.</p></div>}
    </div>
  </section>;
}
