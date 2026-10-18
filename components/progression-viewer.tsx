"use client";

import { useEffect, useRef, useState } from "react";
import type { ProgressionFrame } from "@/lib/progression-data";

export function ProgressionViewer({ frame, active = true }: { frame: ProgressionFrame; active?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) {
      setRendered(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    let view: { delete: () => void } | undefined;
    async function load() {
      try {
        await import("@kitware/vtk.js/Rendering/Profiles/Geometry");
        const [{ default: GenericRenderWindow }, { default: Actor }, { default: Mapper }, { default: Reader }, { default: SphereSource }] = await Promise.all([
          import("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"),
          import("@kitware/vtk.js/Rendering/Core/Actor"),
          import("@kitware/vtk.js/Rendering/Core/Mapper"),
          import("@kitware/vtk.js/IO/XML/XMLPolyDataReader"),
          import("@kitware/vtk.js/Filters/Sources/SphereSource"),
        ]);
        const response = await fetch(`http://127.0.0.1:8000/api/progression/frames/${frame.frameIndex}.vtp`, { signal: controller.signal });
        if (!response.ok) throw new Error(`VTP frame request failed (${response.status}).`);
        const reader = Reader.newInstance();
        reader.parseAsArrayBuffer(await response.arrayBuffer());
        const data = reader.getOutputData(0);
        if (!data?.getNumberOfPoints()) throw new Error("The VTP frame contains no surface points.");
        if (disposed || !container.current) {
          reader.delete();
          return;
        }
        const renderWindow = GenericRenderWindow.newInstance({ background: [0.06, 0.1, 0.15], listenWindowResize: false });
        const actor = Actor.newInstance();
        const mapper = Mapper.newInstance();
        const bounds = data.getBounds();
        const lesionRadius = Math.max(bounds[1] - bounds[0], bounds[3] - bounds[2], bounds[5] - bounds[4]) * 0.035;
        const lesionSource = SphereSource.newInstance({ center: frame.point, radius: lesionRadius, thetaResolution: 24, phiResolution: 16 });
        const lesionActor = Actor.newInstance();
        const lesionMapper = Mapper.newInstance();
        lesionMapper.setInputConnection(lesionSource.getOutputPort());
        lesionActor.setMapper(lesionMapper);
        lesionActor.getProperty().setColor(0.95, 0.08, 0.12);
        lesionActor.getProperty().setAmbient(0.35);
        lesionActor.getProperty().setDiffuse(0.65);
        lesionActor.getProperty().setSpecular(0.2);
        mapper.setInputData(data);
        actor.setMapper(mapper);
        actor.getProperty().setColor(0.72, 0.79, 0.83);
        actor.getProperty().setAmbient(0.25);
        actor.getProperty().setDiffuse(0.75);
        actor.getProperty().setSpecular(0.2);
        renderWindow.setContainer(container.current);
        renderWindow.resize();
        renderWindow.getRenderer().addActor(actor);
        renderWindow.getRenderer().addActor(lesionActor);
        renderWindow.getRenderer().resetCamera();
        renderWindow.getRenderer().resetCameraClippingRange();
        renderWindow.getRenderWindow().render();
        view = renderWindow;
        setRendered(true);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load the VTP frame.");
        }
      }
    }
    setError(null);
    setRendered(false);
    void load();
    return () => {
      disposed = true;
      controller.abort();
      view?.delete();
    };
  }, [active, frame.vtpFile]);

  return (
    <section aria-label={`3D lesion frame ${frame.frameIndex}`} className="overflow-hidden rounded-2xl border border-line bg-[#101a25] shadow-card">
      <div className="relative flex h-72 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_45%,#38506a_0,#172536_42%,#101a25_75%)]">
        <div ref={container} className="absolute inset-0 h-full w-full" />
        {!rendered && <div className="relative z-[1] flex h-full items-center justify-center">
          <div className="h-40 w-40 rounded-[45%] border-2 border-[#c8d5df]/60 bg-[#b6c3cc]/25 shadow-[0_20px_35px_rgba(0,0,0,.35),inset_-20px_-12px_25px_rgba(0,0,0,.25)]">
            <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ef6a72] shadow-[0_0_20px_#ef6a72]" />
          </div>
        </div>}
        <span className="absolute bottom-3 left-3 z-[2] rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/80">{rendered ? frame.vtpFile : error ?? "Loading VTP frame…"}</span>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-xs text-white/80"><span>Frame {frame.frameIndex} · {frame.label}</span><span className="font-mono">({frame.point.join(", ")})</span></div>
    </section>
  );
}
