// What the 3D viewer shows, read from the model's own manifest so every label matches the files it loads.
import manifest from "@/public/models/hfvalid-femur/manifest.json";

export const FEMUR_MODEL = {
  dataset: manifest.dataset, // "HFValid"
  caseId: manifest.case_id, // "Pat001"
  anatomy: manifest.anatomy, // "Complete right femur"
  license: manifest.license, // "CC BY 4.0"
  attribution: manifest.attribution,
  sourceUrl: manifest.source_url,
  solver: manifest.metrics.solver, // "SfePy"
  loadNewtons: manifest.metrics.load_newtons,
};

// "Aldieri, La Mattina, … (2025). HFValid collection. University of Bologna. DOI:…"
//   → FEMUR_AUTHORS "Aldieri et al. (2025)", FEMUR_INSTITUTION "University of Bologna"
const authors = FEMUR_MODEL.attribution.split("(")[0].split(",").map((name) => name.trim()).filter(Boolean);
const year = FEMUR_MODEL.attribution.match(/\((\d{4})\)/)?.[1];
const who = authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ");
export const FEMUR_AUTHORS = year ? `${who} (${year})` : who;
export const FEMUR_INSTITUTION = FEMUR_MODEL.attribution.match(/University[^.]*/)?.[0] ?? "";
