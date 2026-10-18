import { Download, Printer } from "lucide-react";
import printMesh from "@/public/models/hfvalid-femur/bone-print.json";

const MODEL_PATH = "/models/hfvalid-femur";

export function BonePrintExport() {
  return <details className="shrink-0 border-t border-line bg-surface px-5 py-3.5 text-[12px] text-body">
    <summary className="cursor-pointer font-medium text-ink marker:text-muted"><span className="ml-1 inline-flex items-center gap-2"><Printer size={15} className="text-link" aria-hidden />3D print bone · STL</span></summary>
    <div className="mt-3 space-y-3 leading-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">Intact right femur · original size</p>
          <p className="text-muted">{printMesh.dimensions_mm.map(value => value.toFixed(1)).join(" × ")} mm · {printMesh.triangles.toLocaleString()} triangles</p>
        </div>
        <a href={`${MODEL_PATH}/${printMesh.file}`} download={printMesh.download_name} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-semibold text-white transition hover:bg-primary-hover"><Download size={15} aria-hidden />Download STL</a>
      </div>
      <p className="text-muted">Full-resolution 3D Slicer surface, checked for a closed mesh. Exports the complete bone at 1:1 scale, regardless of cut-away, simulation step, or magnification. STL contains the shape only; FEA colors are not included.</p>
      <ol className="list-decimal space-y-1 pl-4 text-muted">
        <li>Open the downloaded STL in Bambu Studio or your preferred slicer. Coordinates are in millimeters.</li>
        <li>Select your printer. Scale uniformly or split the bone to fit its build volume. At 50% scale, the bone is {(printMesh.dimensions_mm[2] / 2).toFixed(1)} mm tall.</li>
        <li>Choose the orientation and supports, slice the plate, and review the preview before printing.</li>
      </ol>
      <p className="text-[11px] text-muted">HFValid Pat001 · {printMesh.license} · <a href={printMesh.source_url} target="_blank" rel="noreferrer" className="text-link hover:underline">Dataset & attribution</a> · <a href={`${MODEL_PATH}/bone-print.json`} download className="text-link hover:underline">Mesh report</a></p>
    </div>
  </details>;
}
