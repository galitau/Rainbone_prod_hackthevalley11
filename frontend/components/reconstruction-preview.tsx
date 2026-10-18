"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { BONE, SPECTRUM, VIEWPORT_BACKGROUND } from "@/lib/spectrum";
import { RECONSTRUCTION_PATH, type ReconstructionPart } from "@/lib/reconstruction-model";

export function ReconstructionPreview({ parts }: { parts: ReconstructionPart[] }) {
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<{ showAssembly: (show: boolean) => void; reset: () => void } | null>(null);
  const [assembly, setAssembly] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading"); setAssembly(false);
    async function initialize() {
      try {
        await import("@kitware/vtk.js/Rendering/Profiles/Geometry");
        const [{ default: Window }, { default: Actor }, { default: Mapper }, { default: Reader }] = await Promise.all([
          import("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"),
          import("@kitware/vtk.js/Rendering/Core/Actor"),
          import("@kitware/vtk.js/Rendering/Core/Mapper"),
          import("@kitware/vtk.js/IO/Geometry/STLReader"),
        ]);
        const buffers = await Promise.all(parts.map(async part => {
          const response = await fetch(`${RECONSTRUCTION_PATH}/${part.file}`, { signal: abort.signal });
          if (!response.ok) throw new Error("The printable parts could not be loaded.");
          return response.arrayBuffer();
        }));
        if (disposed || !container.current) return;
        const view = Window.newInstance({ background: VIEWPORT_BACKGROUND, listenWindowResize: false });
        const renderer = view.getRenderer();
        const objects: { reader: ReturnType<typeof Reader.newInstance>; actor: ReturnType<typeof Actor.newInstance>; mapper: ReturnType<typeof Mapper.newInstance>; part: ReconstructionPart }[] = [];
        const reset = () => {
          const bounds = renderer.computeVisiblePropBounds();
          const center = [(bounds[0] + bounds[1]) / 2, (bounds[2] + bounds[3]) / 2, (bounds[4] + bounds[5]) / 2];
          const camera = renderer.getActiveCamera();
          camera.setFocalPoint(...center as [number, number, number]);
          camera.setPosition(center[0] + 70, center[1] - 700, center[2] + 15);
          camera.setViewUp(0, 0, 1);
          renderer.resetCamera(); renderer.resetCameraClippingRange();
          view.getRenderWindow().render();
        };
        const observer = new ResizeObserver(() => { view.resize(); reset(); });
        cleanup = () => {
          observer.disconnect();
          view.delete();
          objects.forEach(({ actor, mapper, reader }) => { actor.delete(); mapper.delete(); reader.delete(); });
        };
        view.setContainer(container.current);
        parts.forEach((part, index) => {
          const reader = Reader.newInstance();
          const mapper = Mapper.newInstance();
          const actor = Actor.newInstance();
          objects.push({ reader, mapper, actor, part });
          reader.parseAsArrayBuffer(buffers[index]);
          const data = reader.getOutputData(0);
          if (!data?.getNumberOfPoints()) throw new Error("A print mesh is empty or unreadable.");
          mapper.setInputData(data); mapper.setScalarVisibility(false);
          actor.setMapper(mapper);
          actor.getProperty().setColor(...(part.kind === "missing" ? SPECTRUM.cyan : BONE));
          actor.getProperty().setAmbient(0.25);
          actor.getProperty().setDiffuse(0.75);
          actor.getProperty().setSpecular(0.1);
          actor.setVisibility(part.kind === "missing");
          renderer.addActor(actor);
        });
        controls.current = {
          reset,
          showAssembly: show => {
            objects.forEach(({ actor, part }) => actor.setVisibility(part.kind === "missing" || show));
            reset();
          },
        };
        observer.observe(container.current);
        view.resize(); reset(); setStatus("ready");
      } catch (cause) {
        if (disposed) return;
        cleanup?.(); cleanup = undefined; controls.current = null;
        setError(cause instanceof Error ? cause.message : "The print preview is unavailable.");
        setStatus("error");
      }
    }
    void initialize();
    return () => { disposed = true; abort.abort(); controls.current = null; cleanup?.(); };
  }, [parts, attempt]);

  return <div className="overflow-hidden rounded-xl border border-line">
    <div className="flex items-center justify-between gap-2 bg-sunken px-3 py-2">
      <label className="flex items-center gap-2 text-[11px] text-body"><input type="checkbox" checked={assembly} disabled={status !== "ready"} onChange={event => { setAssembly(event.target.checked); controls.current?.showAssembly(event.target.checked); }} className="accent-primary" />Show in femur</label>
      <button aria-label="Reset reconstruction view" disabled={status !== "ready"} onClick={() => controls.current?.reset()} className="rounded-md p-1.5 text-muted hover:text-ink disabled:opacity-40"><RotateCcw size={14} /></button>
    </div>
    <div className="relative h-72 bg-viewport">
      <div ref={container} role="img" aria-label={assembly ? "Printable missing region in cyan fitted into the remaining femur" : "Rotatable printable missing region in cyan"} className="absolute inset-0 touch-none" />
      {status === "loading" && <p role="status" className="absolute inset-0 flex items-center justify-center text-xs text-viewport-ink">Loading printable parts…</p>}
      {status === "error" && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-viewport-ink"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)} className="underline">Retry preview</button></div>}
      {status === "ready" && <p className="pointer-events-none absolute inset-x-2 bottom-2 text-center text-[10px] text-viewport-ink">Drag to rotate · Scroll to zoom</p>}
    </div>
    <p className="bg-sunken px-3 py-2 text-[10px] text-muted">Cyan: printable insert · Original undeformed geometry</p>
  </div>;
}
