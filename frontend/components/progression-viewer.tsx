"use client";

import { useEffect, useRef, useState } from "react";
import type { ProgressionFrame } from "@/lib/progression-data";
import { getProgressionFrame } from "@/lib/progression-cache";

export function ProgressionViewer({ frame, active = true }: { frame: ProgressionFrame; active?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) {
      setRendered(false);
      setError(null);
      return;
    }
    let disposed = false;
    const resources: Array<{ delete: () => void }> = [];
    let releaseView: (() => void) | undefined;
    function cleanup() {
      releaseView?.();
      releaseView = undefined;
      resources.splice(0).reverse().forEach(resource => resource.delete());
    }
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
        const buffer = await getProgressionFrame(frame.frameIndex);
        if (disposed || !container.current) return;
        const reader = Reader.newInstance();
        resources.push(reader);
        reader.parseAsArrayBuffer(buffer);
        const data = reader.getOutputData(0);
        if (!data?.getNumberOfPoints()) throw new Error("The VTP frame contains no surface points.");
        const renderWindow = GenericRenderWindow.newInstance({ background: [0.06, 0.1, 0.15], listenWindowResize: false });
        const renderer = renderWindow.getRenderer();
        const window = renderWindow.getRenderWindow();
        const interactor = renderWindow.getInteractor();
        const style = interactor.getInteractorStyle();
        const resizeObserver = new ResizeObserver(() => {
          if (!disposed) renderWindow.resize();
        });
        releaseView = () => {
          resizeObserver.disconnect();
          // GenericRenderWindow.delete() does not delete its interactor. Stop
          // pending animation before deleting the OpenGL view it renders into.
          interactor.disable();
          // vtk 37's delete() misses the short post-wheel animation tail. This
          // public API cancels its RAF unconditionally; this view is being retired.
          // Its shipped .d.ts still calls this switchToVRAnimation.
          (interactor as typeof interactor & { switchToXRAnimation: () => void }).switchToXRAnimation();
          renderWindow.delete();
          interactor.delete();
          style.delete();
          renderer.delete();
          window.delete();
        };
        const actor = Actor.newInstance();
        const mapper = Mapper.newInstance();
        resources.push(mapper, actor);
        const bounds = data.getBounds();
        const diagonal = Math.max(bounds[1] - bounds[0], bounds[3] - bounds[2], bounds[5] - bounds[4]);
        const volumeProgress = (frame.lesionVolumeCm3 - 4.2) / (8.4 - 4.2);
        const lesionRadius = diagonal * (0.018 + Math.max(0, Math.min(1, volumeProgress)) * 0.03);
        const lesionSource = SphereSource.newInstance({ center: frame.point, radius: lesionRadius, thetaResolution: 24, phiResolution: 16 });
        const lesionActor = Actor.newInstance();
        const lesionMapper = Mapper.newInstance();
        resources.push(lesionSource, lesionMapper, lesionActor);
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
        resizeObserver.observe(container.current);
        renderWindow.resize();
        renderer.addActor(actor);
        renderer.addActor(lesionActor);
        renderer.resetCamera();
        const camera = renderer.getActiveCamera();
        const center = frame.point;
        camera.setFocalPoint(...center);
        // Pull back along the same sightline to show the surrounding anatomy.
        camera.setPosition(center[0] + diagonal * 0.77, center[1] - diagonal * 0.77, center[2] + diagonal * 0.495);
        camera.setViewUp(0, 0, 1);
        renderer.resetCameraClippingRange();
        renderWindow.getRenderWindow().render();
        setRendered(true);
      } catch (cause) {
        cleanup();
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "Could not load the VTP frame.");
        }
      }
    }
    setError(null);
    setRendered(false);
    void load();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [active, frame.frameIndex, frame.vtpFile, frame.point, frame.lesionVolumeCm3, attempt]);

  return (
    <section aria-label={`3D lesion frame ${frame.frameIndex}`} className="overflow-hidden rounded-2xl border border-line bg-[#101a25] shadow-card">
      <div className="relative flex h-72 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_45%,#38506a_0,#172536_42%,#101a25_75%)]">
        <div ref={container} className="absolute inset-0 h-full w-full" />
        {!rendered && <div role={error ? "alert" : "status"} className="relative z-[1] px-6 text-center text-sm text-white/80">
          <p>{error ?? (active ? "Loading scan surface…" : "Preview inactive")}</p>
          {error && <button onClick={() => setAttempt(value => value + 1)} className="mt-3 rounded-lg border border-white/40 px-3 py-2 text-white">Retry frame {frame.frameIndex}</button>}
        </div>}
        <span className="absolute bottom-3 left-3 z-[2] rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/80">{rendered ? frame.vtpFile : error ?? "Loading VTP frame…"}</span>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-xs text-white/80"><span>Frame {frame.frameIndex} · {frame.label}</span><span className="font-mono">({frame.point.join(", ")})</span></div>
    </section>
  );
}
