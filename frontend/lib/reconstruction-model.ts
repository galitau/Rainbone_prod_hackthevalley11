export const RECONSTRUCTION_PATH = "/models/femur-reconstruction";

export type ReconstructionPart = {
  file: string;
  label: string;
  kind: "missing" | "remaining";
  dimensions_mm: number[];
  volume_mm3: number;
  triangles: number;
};

export type ReconstructionFrame = {
  frame_index: number;
  step: number;
  stroke_mm: number;
  raw_removed_volume_mm3: number;
  raw_eroded_volume_percent: number;
  print_insert_volume_mm3: number;
  repair_added_volume_mm3: number;
  parts: ReconstructionPart[];
  report_file: string;
  bundle_file: string;
};

export type ReconstructionModel = { frames: ReconstructionFrame[] };
