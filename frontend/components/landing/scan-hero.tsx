"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import { DATA_RAMP } from "@/lib/spectrum";
import { PEAK_HEIGHT_MM, REPLAY_SLOT_ID, SWEEP_UNDERLINE_ID } from "@/components/landing/stress-profile";

type Phase = "standby" | "ready" | "sweeping" | "done" | "fallback";

// The dashboard's viewer loads the same file, so the landing warms its cache.
const MESH_URL = "/models/hfvalid-femur/fea-surface.vtp";
const SWEEP_MS = 2600;
const SPIN_DEG_PER_S = 10;
const SPIN_EASE_MS = 1200;
const LEGEND_PX = 220;
// Desktop: the femur stands between the HUD (top) and the frame's bottom bracket, so text never crosses the bone.
const UPRIGHT_TOP_PX = 172;
const UPRIGHT_BOTTOM_PX = 48;
const BAND_FILL = 0.9; // share of the band width on phones
const CUT_HALF_MM = 1.5; // surface points this close to the scan plane give the bone's cross-section on screen
const CUT_PAD_PX = 8;
const DONE_HUD = "SOLVED OFFLINE · SfePy · rendered live";
const FOCUS_DARK = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white";

const PHASE_HUD: Record<Exclude<Phase, "done">, string> = {
  standby: "STANDBY · loading solved mesh",
  ready: "SWEEP · knee → head · precomputed field",
  sweeping: "SWEEP · knee → head · precomputed field",
  fallback: "3D PREVIEW UNAVAILABLE · the lab has the full viewer",
};

type Props = { maxMpa: number; loadN: number; lengthMm: number };

/**
 * The landing hero: the real HFValid Pat001 femur (fea-surface.vtp) rendered with vtk.js on a transparent canvas.
 * A scan line sweeps knee → head and reveals the precomputed nodal von Mises field under it; the part above stays pewter.
 * Decorative and non-interactive: vtk's input handlers are unbound and the canvas layer ignores pointer events.
 */
export function ScanHero({ maxMpa, loadN, lengthMm }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const lineYRef = useRef<HTMLDivElement>(null);
  const cutYRef = useRef<HTMLDivElement>(null);
  const tagYRef = useRef<HTMLSpanElement>(null);
  const lineXRef = useRef<HTMLDivElement>(null);
  const cutXRef = useRef<HTMLDivElement>(null);
  const tagXRef = useRef<HTMLSpanElement>(null);
  const tickRef = useRef<HTMLDivElement>(null);
  const hud3Ref = useRef<HTMLSpanElement>(null);
  const replayRef = useRef<() => void>(() => undefined);
  const [phase, setPhase] = useState<Phase>("standby");
  const [reduced, setReduced] = useState(false);
  const [peak, setPeak] = useState({ mpa: maxMpa, heightMm: PEAK_HEIGHT_MM });
  const [played, setPlayed] = useState(false); // the first sweep has finished, so Replay exists from here on
  const [replaySlot, setReplaySlot] = useState<HTMLElement | null>(null);

  useEffect(() => setReplaySlot(document.getElementById(REPLAY_SLOT_ID)), []);

  useEffect(() => {
    const hostEl = hostRef.current;
    const frameEl = frameRef.current;
    if (!hostEl || !frameEl) return;
    const host: HTMLDivElement = hostEl;
    const frame: HTMLDivElement = frameEl;
    let disposed = false;
    let idle = 0;
    let cleanupScene: (() => void) | undefined;
    let onReduceChange: (() => void) | undefined;
    const timers: number[] = [];
    const abort = new AbortController();
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wideQuery = window.matchMedia("(min-width: 1024px)");
    let reduceNow = reduceQuery.matches;
    setReduced(reduceNow);

    const underline = document.getElementById(SWEEP_UNDERLINE_ID);
    const setUnderline = (scale: number, ease = false) => {
      if (!underline) return;
      underline.style.transition = ease ? "transform 700ms cubic-bezier(.2,.8,.2,1)" : "none";
      underline.style.transform = `scaleX(${scale})`;
    };

    const onReduce = () => {
      reduceNow = reduceQuery.matches;
      setReduced(reduceNow);
      onReduceChange?.();
    };
    reduceQuery.addEventListener("change", onReduce);

    const fail = () => {
      if (disposed) return;
      cleanupScene?.();
      cleanupScene = undefined;
      setPhase("fallback");
      setUnderline(1, !reduceNow);
    };

    async function start() {
      try {
        await import("@kitware/vtk.js/Rendering/Profiles/Geometry");
        const [{ default: GenericRenderWindow }, { default: Actor }, { default: Mapper }, { default: Reader },
          { default: ColorTransferFunction }, { default: Plane }] = await Promise.all([
          import("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"),
          import("@kitware/vtk.js/Rendering/Core/Actor"),
          import("@kitware/vtk.js/Rendering/Core/Mapper"),
          import("@kitware/vtk.js/IO/XML/XMLPolyDataReader"),
          import("@kitware/vtk.js/Rendering/Core/ColorTransferFunction"),
          import("@kitware/vtk.js/Common/DataModel/Plane"),
        ]);
        const response = await fetch(MESH_URL, { signal: abort.signal });
        if (!response.ok) throw new Error(`The femur mesh returned ${response.status}.`);
        const buffer = await response.arrayBuffer();
        if (disposed) return;

        performance.mark("rainbone-hero-parse-start");
        const reader = Reader.newInstance();
        reader.parseAsArrayBuffer(buffer);
        const data = reader.getOutputData(0) as vtkPolyData;
        performance.mark("rainbone-hero-parse-end");
        performance.measure("rainbone-hero-parse", "rainbone-hero-parse-start", "rainbone-hero-parse-end");
        const stressArray = data?.getPointData().getArrayByName("von_mises_nodal_mpa");
        if (!data?.getNumberOfPoints() || !stressArray) {
          reader.delete();
          throw new Error("The femur mesh has no nodal stress field.");
        }

        const [x0, x1, y0, y1, z0, z1] = data.getBounds();
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, zc = (z0 + z1) / 2, L = z1 - z0;
        const points = data.getPoints().getData();
        const stress = stressArray.getData();
        const n = stress.length;

        // Live readout: the largest nodal stress within ±3 mm of each height above the distal end.
        const bins = Math.ceil(L) + 1;
        const binMax = new Float32Array(bins);
        let peakIndex = 0;
        for (let i = 0; i < n; i++) {
          const b = Math.min(bins - 1, Math.max(0, Math.floor(points[3 * i + 2] - z0)));
          if (stress[i] > binMax[b]) binMax[b] = stress[i];
          if (stress[i] > stress[peakIndex]) peakIndex = i;
        }
        const profile = new Float32Array(bins);
        for (let mm = 0; mm < bins; mm++) {
          let max = 0;
          for (let j = Math.max(0, mm - 3); j <= Math.min(bins - 1, mm + 3); j++) max = Math.max(max, binMax[j]);
          profile[mm] = max;
        }
        const peakHeight = points[3 * peakIndex + 2] - z0;
        setPeak({ mpa: stress[peakIndex], heightMm: peakHeight });
        // Surface points ordered by height, to find where the scan line crosses the bone on screen.
        const order = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => points[3 * a + 2] - points[3 * b + 2]);
        const sortedZ = Float64Array.from(order, i => points[3 * i + 2]);

        const view = GenericRenderWindow.newInstance({ background: [0, 0, 0, 0], listenWindowResize: false });
        view.setContainer(host);
        view.getInteractor().unbindEvents();
        host.removeAttribute("tabindex");
        host.style.touchAction = "";
        host.style.userSelect = "";
        const glWindow = view.getApiSpecificRenderWindow();
        const canvas = glWindow.getCanvas();
        if (canvas) {
          canvas.style.display = "block";
          canvas.style.height = "100%";
        }
        const renderWindow = view.getRenderWindow();
        const renderer = view.getRenderer();
        const camera = renderer.getActiveCamera();

        // Same colour map as the dashboard: five even stops from 0 to the nodal maximum, no clamping.
        const colors = ColorTransferFunction.newInstance();
        DATA_RAMP.forEach((rgb, i) => colors.addRGBPoint((maxMpa * i) / (DATA_RAMP.length - 1), ...rgb));
        const below = Plane.newInstance({ origin: [cx, cy, z0], normal: [0, 0, -1] }); // stress keeps z <= the scan
        const above = Plane.newInstance({ origin: [cx, cy, z0], normal: [0, 0, 1] }); // pewter keeps z >= the scan

        const stressMapper = Mapper.newInstance();
        stressMapper.setInputData(data);
        stressMapper.setLookupTable(colors);
        stressMapper.setColorModeToMapScalars();
        stressMapper.setScalarModeToUsePointFieldData();
        stressMapper.setColorByArrayName("von_mises_nodal_mpa");
        stressMapper.setScalarRange(0, maxMpa);
        const stressActor = Actor.newInstance();
        stressActor.setMapper(stressMapper);
        const stressLook = stressActor.getProperty();
        stressLook.setAmbient(0.22);
        stressLook.setDiffuse(0.78);
        stressLook.setSpecular(0.12);
        stressLook.setSpecularPower(24);
        stressLook.setInterpolationToPhong();

        const ghostMapper = Mapper.newInstance();
        ghostMapper.setInputData(data);
        ghostMapper.setScalarVisibility(false);
        const ghostActor = Actor.newInstance();
        ghostActor.setMapper(ghostMapper);
        const ghostLook = ghostActor.getProperty();
        ghostLook.setColor(0.3, 0.36, 0.45);
        ghostLook.setAmbient(0.35);
        ghostLook.setDiffuse(0.65);
        ghostLook.setSpecular(0.5);
        ghostLook.setSpecularPower(30);
        ghostLook.setInterpolationToPhong();

        for (const actor of [stressActor, ghostActor]) {
          actor.setOrigin(cx, cy, zc);
          renderer.addActor(actor);
        }
        stressMapper.addClippingPlane(below);
        ghostMapper.addClippingPlane(above);

        // Desktop camera: the dashboard's azimuth with zero elevation, so every z-plane projects to a horizontal line.
        const azimuth = Math.hypot(700, 70);
        const right = [700 / azimuth, 70 / azimuth];
        let W = 0, H = 0, k = 1, focalZ = zc, upright = wideQuery.matches;
        let h = 0, angle = 0, spinMs = 0, last = 0, raf = 0;
        let sweeping = false, spinning = false, dirty = false, visible = true;

        const setCut = (z: number) => {
          below.setOrigin(cx, cy, z);
          above.setOrigin(cx, cy, z);
        };
        const orient = () => {
          stressActor.setOrientation(0, 0, angle);
          ghostActor.setOrientation(0, 0, angle);
          renderer.resetCameraClippingRange();
        };
        // Screen extent (mm from the view centre, across the scan line) of the bone's cross-section at height z.
        const crossSection = (z: number): [number, number] | null => {
          let lo = 0, hi = n;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sortedZ[mid] < z - CUT_HALF_MM) lo = mid + 1;
            else hi = mid;
          }
          const cos = Math.cos((angle * Math.PI) / 180), sin = Math.sin((angle * Math.PI) / 180);
          let min = Infinity, max = -Infinity;
          for (let j = lo; j < n && sortedZ[j] <= z + CUT_HALF_MM; j++) {
            const i = order[j];
            const dx = points[3 * i] - cx, dy = points[3 * i + 1] - cy;
            const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
            const s = upright ? rx * right[0] + ry * right[1] : rx; // band: screen-up is -x, so +x runs down the screen
            if (s < min) min = s;
            if (s > max) max = s;
          }
          return min <= max ? [min, max] : null;
        };
        const place = () => {
          const z = z0 + h;
          const value = profile[Math.min(bins - 1, Math.max(0, Math.round(h)))];
          const text = `${Math.round(h)} mm · σ ${value.toFixed(2)} MPa`;
          const span = crossSection(z);
          if (upright) {
            const line = lineYRef.current, cut = cutYRef.current, tag = tagYRef.current;
            if (line) {
              line.style.top = "0px";
              line.style.transform = `translate3d(0, ${H / 2 - (z - focalZ) * k}px, 0)`;
            }
            if (tag) tag.textContent = text;
            if (cut) {
              cut.style.visibility = span ? "visible" : "hidden";
              if (span) {
                const a = W / 2 + span[0] * k - CUT_PAD_PX, b = W / 2 + span[1] * k + CUT_PAD_PX;
                cut.style.transform = `translate3d(${a}px, -50%, 0) scaleX(${(b - a) / 100})`;
              }
            }
          } else {
            const x = W / 2 + (z - focalZ) * k;
            const line = lineXRef.current, cut = cutXRef.current, tag = tagXRef.current;
            if (line) {
              line.style.left = "0px";
              line.style.transform = `translate3d(${x}px, 0, 0)`;
            }
            if (tag) {
              tag.textContent = text;
              tag.style.transform = x > W / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)"; // never past the band's edge
            }
            if (cut) {
              cut.style.visibility = span ? "visible" : "hidden";
              if (span) {
                const a = H / 2 + span[0] * k - CUT_PAD_PX, b = H / 2 + span[1] * k + CUT_PAD_PX;
                cut.style.transform = `translate3d(-50%, ${a}px, 0) scaleY(${(b - a) / 100})`;
              }
            }
          }
          return value;
        };
        const sweepStep = () => {
          setCut(z0 + h);
          const value = place();
          if (tickRef.current) tickRef.current.style.transform = `translate3d(0, ${(1 - Math.min(1, value / maxMpa)) * LEGEND_PX}px, 0)`;
          setUnderline(h / L);
          const hud = h < 18 ? "FIXED SUPPORT · distal 15 mm" : h > L - 8 ? `LOAD · ${loadN} N on the femoral head` : "NODAL VON MISES · slice max";
          const hudLine = hud3Ref.current;
          if (hudLine && hudLine.textContent !== hud) hudLine.textContent = hud;
        };
        const showDone = () => {
          sweeping = false;
          h = L;
          stressMapper.removeAllClippingPlanes();
          ghostActor.setVisibility(false);
          if (tickRef.current) tickRef.current.style.transform = "translate3d(0, 0, 0)";
          setUnderline(1);
          frame.setAttribute("data-flare", "");
          timers.push(window.setTimeout(() => frame.removeAttribute("data-flare"), 700));
          setPhase("done");
          setPlayed(true);
        };

        const loop = () => {
          if (raf || disposed) return;
          const animating = (sweeping || spinning) && visible && !document.hidden;
          if (!animating) last = 0;
          if (animating || dirty) raf = requestAnimationFrame(step);
        };
        const requestRender = () => {
          dirty = true;
          loop();
        };
        const step = (t: number) => {
          raf = 0;
          if (disposed) return;
          const dt = last ? Math.min(100, t - last) : 0;
          last = t;
          if (sweeping) {
            h = Math.min(L, h + (L * dt) / SWEEP_MS); // linear: the coloured 120–300 mm band gets about 1.2 s
            sweepStep();
            if (h >= L) {
              showDone();
              timers.push(window.setTimeout(() => {
                if (disposed || sweeping || reduceNow) return;
                spinning = true;
                spinMs = 0;
                loop();
              }, 300));
            }
          }
          if (spinning) {
            spinMs += dt;
            const e = Math.min(1, spinMs / SPIN_EASE_MS);
            angle = (angle + (SPIN_DEG_PER_S * e * e * (3 - 2 * e) * dt) / 1000) % 360;
            orient();
          }
          renderWindow.render();
          dirty = false;
          loop();
        };

        // Size the drawing buffer from the host (never transformed), with the device pixel ratio capped at 2.
        const fit = () => {
          const rect = host.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return;
          W = rect.width;
          H = rect.height;
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          glWindow.setSize(Math.floor(W * ratio), Math.floor(H * ratio));
          upright = wideQuery.matches;
          camera.setParallelProjection(true);
          if (upright) {
            // k px per mm so the femur spans the room between the reserves; then shift the view so it sits there.
            const top = Math.min(UPRIGHT_TOP_PX, H * 0.22);
            const span = Math.max(H * 0.5, H - top - UPRIGHT_BOTTOM_PX);
            k = span / L;
            focalZ = zc + (top + span / 2 - H / 2) / k;
            camera.setFocalPoint(cx, cy, focalZ);
            camera.setPosition(cx + 70, cy - 700, focalZ);
            camera.setViewUp(0, 0, 1);
          } else {
            // Phones: the femur lies across the band, knee on the left and head on the right (screen-right is +z).
            k = (BAND_FILL * W) / L;
            focalZ = zc;
            camera.setFocalPoint(cx, cy, zc);
            camera.setPosition(cx, cy - 700, zc);
            camera.setViewUp(-1, 0, 0);
          }
          camera.setParallelScale(H / (2 * k));
          renderer.resetCameraClippingRange();
          place();
          requestRender();
        };

        const startSweep = () => {
          if (disposed || reduceNow || sweeping) return;
          h = 0;
          last = 0;
          sweeping = true;
          setPhase("sweeping");
          loop();
        };
        const jumpToDone = () => {
          timers.splice(0).forEach(window.clearTimeout);
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          spinning = false;
          angle = 0;
          orient();
          showDone();
          requestRender();
        };
        replayRef.current = () => {
          if (disposed || sweeping || reduceNow) return;
          timers.splice(0).forEach(window.clearTimeout);
          spinning = false;
          stressMapper.removeAllClippingPlanes();
          stressMapper.addClippingPlane(below);
          ghostActor.setVisibility(true);
          frame.removeAttribute("data-flare");
          h = 0;
          sweepStep();
          setPhase("sweeping");
          sweeping = true;
          last = 0;
          loop();
        };
        onReduceChange = () => {
          if (reduceNow) jumpToDone();
        };

        const resize = new ResizeObserver(fit);
        const intersection = new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? true;
          loop();
        });
        const onLost = () => fail();
        wideQuery.addEventListener("change", fit);
        document.addEventListener("visibilitychange", loop);
        canvas?.addEventListener("webglcontextlost", onLost);
        cleanupScene = () => {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          sweeping = false;
          spinning = false;
          resize.disconnect();
          intersection.disconnect();
          wideQuery.removeEventListener("change", fit);
          document.removeEventListener("visibilitychange", loop);
          canvas?.removeEventListener("webglcontextlost", onLost);
          onReduceChange = undefined;
          replayRef.current = () => undefined;
          view.delete();
          stressActor.delete();
          ghostActor.delete();
          stressMapper.delete();
          ghostMapper.delete();
          colors.delete();
          below.delete();
          above.delete();
          reader.delete();
        };

        // First frame: the whole femur in pewter, the scan parked at the distal end. Throws without WebGL2.
        orient();
        setCut(z0);
        fit();
        renderWindow.render();
        resize.observe(host);
        intersection.observe(frame);
        if (reduceNow) {
          jumpToDone();
          return;
        }
        setPhase("ready");
        // Let the headline land first: never before 900 ms after navigation start.
        const at = Math.max(performance.now() + 250, 900);
        timers.push(window.setTimeout(startSweep, at - performance.now()));
      } catch {
        if (!disposed) fail();
      }
    }

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) fail();
    else if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => void start(), { timeout: 600 });
    else timers.push(window.setTimeout(() => void start(), 200));

    return () => {
      disposed = true;
      abort.abort();
      if (idle) window.cancelIdleCallback(idle);
      timers.splice(0).forEach(window.clearTimeout);
      reduceQuery.removeEventListener("change", onReduce);
      cleanupScene?.();
      cleanupScene = undefined;
    };
  }, [maxMpa, loadN]);

  const live = phase === "ready" || phase === "sweeping" || phase === "done";
  const hud = phase === "done" ? `PEAK NODAL ${peak.mpa.toFixed(2)} MPa · ${Math.round(peak.heightMm)} mm above distal end` : PHASE_HUD[phase];
  const label = `Precomputed SfePy stress on the HFValid Pat001 femur, revealed from knee to head; peak nodal von Mises ${maxMpa.toFixed(2)} MPa, ${PEAK_HEIGHT_MM} mm above the distal end.`;
  const bracket = "pointer-events-none absolute h-4 w-4 border-white/20";
  const maxLabel = maxMpa.toFixed(2);
  // Stays mounted while a replay sweeps (dimmed, inert) so keyboard focus is not dropped to <body>.
  const showReplay = played && !reduced && (phase === "done" || phase === "sweeping");
  const replayButton = (place: string) => (
    <button
      type="button"
      aria-disabled={phase !== "done"}
      onClick={() => {
        if (phase === "done") replayRef.current();
      }}
      className={`rb-appear inline-flex items-center gap-1.5 rounded-lg border border-viewport-line bg-viewport/70 font-mono text-viewport-ink backdrop-blur-sm transition after:absolute after:-inset-2 after:content-[''] ${phase === "done" ? "hover:border-nav-line hover:text-white" : "cursor-default opacity-50"} ${FOCUS_DARK} ${place}`}
    >
      ↻ Replay scan
    </button>
  );

  return (
    <div data-phase={phase} className="group relative -mx-4 mt-6 h-[200px] overflow-hidden md:h-[240px] lg:absolute lg:inset-y-0 lg:right-[max(0px,calc((100vw-1440px)/2))] lg:z-0 lg:mx-0 lg:mt-0 lg:h-auto lg:w-[48vw] lg:min-w-[520px] lg:max-w-[760px]">
      <div ref={frameRef} role="img" aria-label={label} className="absolute inset-0">
        <div ref={hostRef} aria-hidden className={`rb-fade pointer-events-none absolute inset-0 ${live ? "opacity-100" : "opacity-0"}`} />

        <span aria-hidden className={`${bracket} left-[10px] top-[10px] border-l border-t lg:left-6 lg:top-[88px]`} />
        <span aria-hidden className={`${bracket} right-[10px] top-[10px] border-r border-t lg:right-6 lg:top-[88px]`} />
        <span aria-hidden className={`${bracket} bottom-[10px] left-[10px] border-b border-l lg:bottom-6 lg:left-6`} />
        <span aria-hidden className={`${bracket} bottom-[10px] right-[10px] border-b border-r lg:bottom-6 lg:right-6`} />

        <div aria-hidden className="pointer-events-none absolute left-[22px] top-[18px] font-mono text-[9.5px] leading-[1.6] tracking-[0.1em] lg:left-[44px] lg:top-[104px] lg:text-[11px] lg:tracking-[0.12em]">
          <p className="text-viewport-ink/80">HFVALID PAT001 · RIGHT FEMUR · {lengthMm} mm</p>
          <p className="text-white/90">{hud}</p>
          <p className="hidden text-nav-muted lg:block">
            {phase === "sweeping" ? <span ref={hud3Ref} /> : phase === "done" ? DONE_HUD : `SOLVED OFFLINE · SfePy · ${loadN} N`}
          </p>
        </div>

        {/* Desktop scan line: moved only by transform; parked at the distal end until the mesh is in. */}
        <div ref={lineYRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(100%-48px)] hidden h-0 will-change-transform lg:block">
          <div className="rb-scan relative h-0">
            <div className="rb-fade-x absolute left-0 right-[112px] -top-3 h-6 bg-[linear-gradient(180deg,transparent,rgb(var(--spectrum-cyan)/0.3),transparent)]" />
            <div className="rb-fade-x absolute left-0 right-[112px] top-0 h-px bg-white/90" />
            <div className="rb-fade-x absolute left-0 right-[112px] top-px h-20 bg-gradient-to-b from-[rgb(var(--spectrum-cyan)/0.18)] to-transparent opacity-0 group-data-[phase=sweeping]:opacity-100" />
            <div ref={cutYRef} className="rb-cut-x invisible absolute left-0 top-0 h-[9px] w-[100px] origin-left opacity-0 group-data-[phase=sweeping]:opacity-100" />
            <span ref={tagYRef} className="absolute right-24 top-0 -translate-y-1/2 whitespace-nowrap rounded border border-viewport-line bg-viewport/80 px-2 py-1 font-mono text-[11px] tabular-nums text-white opacity-0 backdrop-blur-sm group-data-[phase=sweeping]:opacity-100" />
          </div>
        </div>

        {/* Phone scan line: the femur lies across the band, so the line is vertical and moves left → right. */}
        <div ref={lineXRef} aria-hidden className="pointer-events-none absolute inset-y-0 left-[5%] w-0 will-change-transform lg:hidden">
          <div className="rb-scan-x absolute inset-y-0 left-0 w-0">
            <div className="rb-fade-y absolute -left-3 bottom-6 top-12 w-6 bg-[linear-gradient(90deg,transparent,rgb(var(--spectrum-cyan)/0.3),transparent)]" />
            <div className="rb-fade-y absolute bottom-6 left-0 top-12 w-px bg-white/90" />
            <div className="rb-fade-y absolute bottom-6 right-0 top-12 w-16 bg-gradient-to-l from-[rgb(var(--spectrum-cyan)/0.18)] to-transparent opacity-0 group-data-[phase=sweeping]:opacity-100" />
            <div ref={cutXRef} className="rb-cut-y invisible absolute left-0 top-0 h-[100px] w-[9px] origin-top opacity-0 group-data-[phase=sweeping]:opacity-100" />
            <span ref={tagXRef} className="absolute bottom-8 left-0 whitespace-nowrap rounded border border-viewport-line bg-viewport/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white opacity-0 group-data-[phase=sweeping]:opacity-100" />
          </div>
        </div>

        <div aria-hidden className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 lg:block">
          <p className="mb-3 text-right font-mono text-[10px] tracking-[0.12em] text-nav-muted">NODAL VON MISES · MPa</p>
          <div className="flex justify-end gap-3">
            <div className="relative h-[220px] w-1">
              <div className="rb-legend h-full w-full rounded-full" />
              <div ref={tickRef} className="absolute -left-[11px] top-0 h-0 w-0 translate-y-[220px] will-change-transform">
                <svg width="7" height="8" viewBox="0 0 7 8" className="-translate-y-1/2" aria-hidden><path d="M0 0 L7 4 L0 8 Z" fill="white" /></svg>
              </div>
            </div>
            <div className="flex h-[220px] flex-col justify-between font-mono text-[11px] leading-none text-viewport-ink">
              <span className="-translate-y-1/2">{maxLabel}</span>
              <span className="translate-y-1/2">0</span>
            </div>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute bottom-[14px] right-[22px] flex items-center gap-2 font-mono text-[9.5px] text-viewport-ink lg:hidden">
          <span className="spectrum-ramp h-[3px] w-24 rounded-full" />
          <span>0–{maxLabel} MPa</span>
        </div>
      </div>

      {showReplay && replayButton("absolute bottom-[12px] left-[22px] z-10 h-8 px-2.5 text-[9.5px] lg:hidden")}
      {showReplay && replaySlot && createPortal(replayButton("relative h-9 px-3 text-[11px]"), replaySlot)}
    </div>
  );
}
