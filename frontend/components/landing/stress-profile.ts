import { DATA_RAMP } from "@/lib/spectrum";

// 95th percentile of von_mises_nodal_mpa in 48 equal z-slices of public/models/hfvalid-femur/fea-surface.vtp,
// from distal min z -428.82 to proximal max -31.82 mm (knee → head). Linear interpolation between ranks.
export const STRESS_PROFILE_P95 = [
  0.0, 0.53, 0.72, 0.9, 1.03, 1.76, 2.63, 3.8, 5.0, 5.47, 6.28, 6.82, 7.61, 9.03, 10.09, 11.48,
  12.08, 12.65, 13.03, 13.49, 13.93, 14.32, 14.38, 14.29, 14.47, 14.27, 14.82, 14.31, 14.28, 14.78, 14.46, 14.84,
  14.59, 13.7, 12.44, 11.76, 12.37, 10.18, 8.18, 6.31, 4.8, 5.16, 5.42, 3.89, 2.0, 2.94, 2.35, 1.03,
];

// argmax of von_mises_nodal_mpa in fea-surface.vtp, 241.3 mm above distal minimum z.
// Only for server-rendered aria text; the hero recomputes the live value from the mesh it loads.
export const PEAK_HEIGHT_MM = 241;

// The hairline under "800 newtons" in the landing headline; the hero draws it as the scan rises.
export const SWEEP_UNDERLINE_ID = "rb-sweep-underline";

// Where the hero portals its desktop Replay button: after the CTA in the DOM, so the tab order follows the reading order.
export const REPLAY_SLOT_ID = "rb-replay-slot";

// The dashboard's blue → red data ramp, sampled at t in [0, 1].
export function rampColor(t: number) {
  const x = Math.min(1, Math.max(0, t)) * (DATA_RAMP.length - 1);
  const i = Math.min(DATA_RAMP.length - 2, Math.floor(x));
  const f = x - i;
  return `rgb(${DATA_RAMP[i].map((v, k) => Math.round(255 * (v + (DATA_RAMP[i + 1][k] - v) * f))).join(" ")})`;
}
