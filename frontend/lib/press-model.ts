export type PressField = "failure_index" | "stress_mpa" | "displacement_mm" | "damage" | "anatomy";

export type PressFrame = {
  file: string;
  stroke_mm: number;
  load_n: number;
  max_stress_mpa: number;
  max_nodal_stress_mpa: number;
  max_displacement_mm: number;
  max_damage: number;
  max_failure_index: number;
  damaged_volume_percent: number;
  eroded_volume_percent: number;
  head_motion_mm: [number, number, number];
};

export type PressModel = {
  title: string;
  case_id: string;
  source_url: string;
  solver: string;
  nodes: number;
  elements: number;
  youngs_modulus_mpa: number;
  poisson_ratio: number;
  tensile_strain_limit: number;
  compressive_strain_limit: number;
  strain_averaging_radius_mm: number;
  stress_color_max_mpa: number;
  first_limit_stroke_mm: number;
  bounds: [number, number, number, number, number, number];
  head_center: [number, number, number];
  frames: PressFrame[];
};

export const PRESS_PATH = "/models/femur-press";

export function pressStage(frame: PressFrame) {
  if (frame.eroded_volume_percent > 0) return "Failure visualization";
  if (frame.max_damage > 0.05) return "Damage developing";
  if (frame.stroke_mm === 0) return "Ready to compress";
  return "Elastic compression";
}
