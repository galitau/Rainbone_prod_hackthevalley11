// What the 3D viewer shows, read from the model's own manifest so every label matches the files it loads.
import manifest from "@/public/models/hfvalid-femur/manifest.json";

// The strength the API divides by (backend: fracture_risk_index_percent = stress / 150 MPa x 100).
export const ASSUMED_STRENGTH_MPA = 150;

const metrics = manifest.metrics;

export const FEMUR_MODEL = {
  dataset: manifest.dataset, // "HFValid"
  caseId: manifest.case_id, // "Pat001"
  anatomy: manifest.anatomy, // "Complete right femur"
  license: manifest.license, // "CC BY 4.0"
  attribution: manifest.attribution,
  sourceUrl: manifest.source_url,
  solver: metrics.solver, // "SfePy"
  loadNewtons: metrics.load_newtons, // 800
  // The top of the viewer's stress colour scale: volume-weighted nodal averages of the element stress.
  shownStressMpa: metrics.max_nodal_von_mises_mpa, // 15.83
  // The single highest element stress before averaging (kept in the downloadable VTU).
  elementStressMpa: metrics.max_von_mises_mpa, // 41.98
  maxDisplacementMm: metrics.max_displacement_mm, // 3.93, the top of the displacement colour scale
  volumeCm3: metrics.volume_cm3, // 408.09
  youngsModulusGpa: metrics.youngs_modulus_mpa / 1000, // 10, one uniform assumed value
  poissonRatio: metrics.poisson_ratio,
  elements: metrics.elements,
  nodes: metrics.nodes,
  supportDepthMm: metrics.support_depth_mm, // 15
};

// Illustrative index from the stress the 3D colours show (nodal-averaged peak / assumed strength). The API computes its
// index the same way from the 99.5th percentile of element stress, so the two are not the same number.
export const FEMUR_INDEX_PERCENT = (FEMUR_MODEL.shownStressMpa / ASSUMED_STRENGTH_MPA) * 100; // 10.55

// The femur's numbers in the shape POST /api/explain accepts (the fields of a /api/simulate response).
export const FEMUR_EXPLAIN_REQUEST = {
  load_newtons: FEMUR_MODEL.loadNewtons,
  max_von_mises_stress_mpa: FEMUR_MODEL.shownStressMpa,
  average_youngs_modulus_gpa: FEMUR_MODEL.youngsModulusGpa,
  bone_volume_cm3: FEMUR_MODEL.volumeCm3,
  fracture_risk_index_percent: FEMUR_INDEX_PERCENT,
};

// The femur's own solve in the shape POST /api/risk-analysis accepts next to its HFValid case id.
export const FEMUR_RISK_FE = {
  peak_stress_mpa: FEMUR_MODEL.shownStressMpa,
  load_newtons: FEMUR_MODEL.loadNewtons,
  stress_index_percent: FEMUR_INDEX_PERCENT,
};

// "Aldieri, La Mattina, … (2025). HFValid collection. University of Bologna. DOI:…"
//   → FEMUR_AUTHORS "Aldieri et al. (2025)", FEMUR_INSTITUTION "University of Bologna"
const authors = FEMUR_MODEL.attribution.split("(")[0].split(",").map((name) => name.trim()).filter(Boolean);
const year = FEMUR_MODEL.attribution.match(/\((\d{4})\)/)?.[1];
const who = authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ");
export const FEMUR_AUTHORS = year ? `${who} (${year})` : who;
export const FEMUR_INSTITUTION = FEMUR_MODEL.attribution.match(/University[^.]*/)?.[0] ?? "";
