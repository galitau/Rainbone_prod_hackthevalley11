"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Maximize2, RotateCcw } from "lucide-react";

type ViewerState = "loading" | "ready" | "error";

export function BoneViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderWindowRef = useRef<{ render: () => void } | null>(null);
  const rendererRef = useRef<{ resetCamera: () => void } | null>(null);
  const clippingPlaneRef = useRef<{ setOrigin: (x: number, y: number, z: number) => void } | null>(null);
  const [clipPosition, setClipPosition] = useState(50);
  const [viewerState, setViewerState] = useState<ViewerState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let genericRenderWindow: { delete: () => void } | undefined;

    async function loadVolume() {
      if (!containerRef.current) return;

      try {
        const [
          { default: vtkGenericRenderWindow },
          { default: vtkVolume },
          { default: vtkVolumeMapper },
          { default: vtkColorTransferFunction },
          { default: vtkPiecewiseFunction },
          { default: vtkPlane },
          nifti,
        ] = await Promise.all([
          import("@kitware/vtk.js/Rendering/Misc/GenericRenderWindow"),
          import("@kitware/vtk.js/Rendering/Core/Volume"),
          import("@kitware/vtk.js/Rendering/Core/VolumeMapper"),
          import("@kitware/vtk.js/Rendering/Core/ColorTransferFunction"),
          import("@kitware/vtk.js/Common/DataModel/PiecewiseFunction"),
          import("@kitware/vtk.js/Common/DataModel/Plane"),
          import("nifti-reader-js"),
        ]);

        const response = await fetch("/sample_bone.nii.gz");
        if (!response.ok) throw new Error("The sample NIfTI file is not available.");
        let arrayBuffer = await response.arrayBuffer();
        if (nifti.isCompressed(arrayBuffer)) {
          arrayBuffer = nifti.decompress(arrayBuffer) as ArrayBuffer;
        }
        if (!nifti.isNIFTI(arrayBuffer)) throw new Error("The sample file is not a valid NIfTI volume.");

        const header = nifti.readHeader(arrayBuffer);
        if (!header) throw new Error("Unable to read the NIfTI header.");
        const imageBuffer = nifti.readImage(header, arrayBuffer);
        if (!imageBuffer) throw new Error("Unable to read the NIfTI image data.");
        const dimensions = [header.dims[1], header.dims[2], header.dims[3]];
        const scalarArray = readScalarValues(header.datatypeCode, imageBuffer);

        const { default: vtkImageData } = await import("@kitware/vtk.js/Common/DataModel/ImageData");
        const { default: vtkDataArray } = await import("@kitware/vtk.js/Common/Core/DataArray");
        const imageData = vtkImageData.newInstance();
        imageData.setDimensions(dimensions[0], dimensions[1], dimensions[2]);
        imageData.getPointData().setScalars(vtkDataArray.newInstance({
          name: "Hounsfield Units",
          numberOfComponents: 1,
          values: scalarArray,
        }));

        if (disposed || !containerRef.current) return;
        const view = vtkGenericRenderWindow.newInstance({ background: [0.03, 0.06, 0.09] });
        view.setContainer(containerRef.current);
        genericRenderWindow = view;
        const renderer = view.getRenderer();
        const renderWindow = view.getRenderWindow();
        const mapper = vtkVolumeMapper.newInstance();
        mapper.setInputData(imageData);
        mapper.setSampleDistance(0.7);

        const volume = vtkVolume.newInstance();
        volume.setMapper(mapper);
        const colorTransferFunction = vtkColorTransferFunction.newInstance();
        colorTransferFunction.addRGBPoint(-1000, 0.02, 0.04, 0.06);
        colorTransferFunction.addRGBPoint(100, 0.12, 0.3, 0.31);
        colorTransferFunction.addRGBPoint(350, 0.65, 0.75, 0.74);
        colorTransferFunction.addRGBPoint(900, 0.92, 0.95, 0.94);
        const opacityFunction = vtkPiecewiseFunction.newInstance();
        opacityFunction.addPoint(-1000, 0);
        opacityFunction.addPoint(100, 0);
        opacityFunction.addPoint(350, 0.18);
        opacityFunction.addPoint(900, 0.85);
        volume.getProperty().setRGBTransferFunction(0, colorTransferFunction);
        volume.getProperty().setScalarOpacity(0, opacityFunction);
        volume.getProperty().setInterpolationTypeToLinear();

        const clippingPlane = vtkPlane.newInstance();
        clippingPlane.setNormal(0, 0, 1);
        mapper.addClippingPlane(clippingPlane);
        renderer.addVolume(volume);
        renderer.resetCamera();
        renderWindow.render();
        clippingPlaneRef.current = clippingPlane;
        rendererRef.current = renderer;
        renderWindowRef.current = renderWindow;
        if (!disposed) setViewerState("ready");
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : "Viewer could not initialize.");
          setViewerState("error");
        }
      }
    }

    void loadVolume();
    return () => {
      disposed = true;
      genericRenderWindow?.delete();
      clippingPlaneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const plane = clippingPlaneRef.current;
    if (!plane) return;
    plane.setOrigin(0, 0, (clipPosition - 50) / 50);
    renderWindowRef.current?.render();
  }, [clipPosition]);

  function resetCamera() {
    rendererRef.current?.resetCamera();
    renderWindowRef.current?.render();
    setClipPosition(50);
  }

  function readScalarValues(datatypeCode: number, imageBuffer: ArrayBuffer): Float32Array {
    switch (datatypeCode) {
      case 2:
        return Float32Array.from(new Uint8Array(imageBuffer));
      case 4:
        return Float32Array.from(new Int16Array(imageBuffer));
      case 8:
        return Float32Array.from(new Int32Array(imageBuffer));
      case 16:
        return new Float32Array(imageBuffer);
      case 64:
        return Float32Array.from(new Float64Array(imageBuffer));
      case 512:
        return Float32Array.from(new Uint16Array(imageBuffer));
      case 768:
        return Float32Array.from(new Uint32Array(imageBuffer));
      default:
        throw new Error(`Unsupported NIfTI datatype code: ${datatypeCode}`);
    }
  }

  return (
    <section className="relative min-h-[480px] overflow-hidden rounded-xl border border-line bg-[#0a121b] shadow-glow">
      <div className="mesh-grid absolute inset-0" />
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(79,219,209,0.11),transparent_35%)]" />
      <div className="absolute left-5 top-5 z-10">
        <div className="flex items-center gap-2 text-xs font-medium text-ink">
          <span className={`h-2 w-2 rounded-full ${viewerState === "ready" ? "animate-pulse bg-cyan" : "bg-warning"}`} />
          3D volume reconstruction
        </div>
        <p className="mt-1 font-mono text-[10px] text-muted">sample_bone.nii.gz · NIfTI</p>
      </div>
      <div className="absolute right-5 top-5 z-10 flex gap-2">
        <button onClick={resetCamera} className="rounded-lg border border-line bg-panel/80 p-2 text-muted backdrop-blur hover:text-ink" aria-label="Reset camera"><RotateCcw size={15} /></button>
        <button className="rounded-lg border border-line bg-panel/80 p-2 text-muted backdrop-blur hover:text-ink" aria-label="Maximize viewer"><Maximize2 size={15} /></button>
      </div>
      <div className="absolute bottom-5 left-5 z-10 flex items-center gap-2 rounded-lg border border-line bg-panel/80 px-3 py-2 font-mono text-[9px] text-muted backdrop-blur"><Box size={14} className="text-cyan" /> AXIAL · VOLUME RENDER <span className="mx-1 text-line">|</span> {viewerState.toUpperCase()}</div>
      <div className="absolute bottom-5 right-5 z-10 flex w-56 items-center gap-3 rounded-lg border border-line bg-panel/90 px-3 py-2 backdrop-blur">
        <label htmlFor="clip-slider" className="whitespace-nowrap text-[10px] text-muted">Z slice</label>
        <input id="clip-slider" type="range" min="0" max="100" value={clipPosition} onChange={(event) => setClipPosition(Number(event.target.value))} className="h-1 w-full accent-cyan" aria-label="Z-axis clipping plane position" />
        <span className="w-7 text-right font-mono text-[10px] text-cyan">{clipPosition}%</span>
      </div>
      {error && <p className="absolute bottom-16 right-5 z-10 max-w-xs rounded-md border border-[#8e4b4b] bg-[#2d171c] px-3 py-2 text-xs text-[#ffaaa5]">{error}</p>}
    </section>
  );
}
