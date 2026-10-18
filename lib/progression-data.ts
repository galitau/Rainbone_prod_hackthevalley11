export type Point3 = [number, number, number];

export type ProgressionFrame = {
  frameIndex: number;
  month: number;
  label: string;
  point: Point3;
  peakVonMisesMPa: number;
  fractureRiskPercent: number;
  corticalThicknessMm: number;
  lesionVolumeCm3: number;
  vtpFile: string;
};

const FRAME_COUNT = 8;

export function generateProgressionTimeline(baselinePt: Point3, followupPt: Point3): ProgressionFrame[] {
  if (![...baselinePt, ...followupPt].every(Number.isFinite)) {
    throw new Error("Baseline and follow-up coordinates must contain finite numbers.");
  }

  return Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
    const progress = frameIndex / (FRAME_COUNT - 1);
    const point: Point3 = baselinePt.map((value, axis) =>
      Number((value + (followupPt[axis] - value) * progress).toFixed(3)),
    ) as Point3;
    const lesionVolumeCm3 = 8.4 + progress * 2.1;
    const fractureRiskPercent = Math.round(31 + progress * 22);
    return {
      frameIndex,
      month: Math.round(progress * 12),
      label: frameIndex === 0 ? "Baseline" : frameIndex === FRAME_COUNT - 1 ? "Follow-up" : `Month ${Math.round(progress * 12)}`,
      point,
      peakVonMisesMPa: Number((91.2 + progress * 24.8).toFixed(1)),
      fractureRiskPercent,
      corticalThicknessMm: Number((3.8 - progress * 0.7).toFixed(1)),
      lesionVolumeCm3: Number(lesionVolumeCm3.toFixed(1)),
      vtpFile: `frame-${String(frameIndex).padStart(2, "0")}.vtp`,
    };
  });
}
