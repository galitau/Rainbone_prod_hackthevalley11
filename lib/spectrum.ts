// The Rainbone data ramp, shared by every 3D color map so legends, brand and
// viewport agree. Keep in sync with --spectrum-* in app/globals.css.
export type RGB = [number, number, number];

const hex = (value: string): RGB => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255) as RGB;

export const SPECTRUM = {
  blue: hex("#2f4fd8"),
  cyan: hex("#12a0c4"),
  green: hex("#3baa6e"),
  amber: hex("#f0b429"),
  red: hex("#d9412b"),
} as const;

// Five evenly spaced stops from 0 to max.
export const DATA_RAMP: RGB[] = [SPECTRUM.blue, SPECTRUM.cyan, SPECTRUM.green, SPECTRUM.amber, SPECTRUM.red];

// Dark "reading room" background for vtk render windows (matches --viewport).
export const VIEWPORT_BACKGROUND: RGB = hex("#0b1320");

// Bone surface tint used when no field is displayed.
export const BONE: RGB = hex("#e8e2d4");
