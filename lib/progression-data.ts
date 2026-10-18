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
const BASELINE_LESION_VOLUME_CM3 = 8.4;
const FOLLOWUP_LESION_VOLUME_CM3 = 4.2;

export function generateProgressionTimeline(baselinePt: Point3, followupPt: Point3): ProgressionFrame[] {
  if (![...baselinePt, ...followupPt].every(Number.isFinite)) {
    throw new Error("Baseline and follow-up coordinates must contain finite numbers.");
  }

  return Array.from({ length: FRAME_COUNT }, (_, frameIndex) => {
    const progress = frameIndex / (FRAME_COUNT - 1);
    const point: Point3 = baselinePt.map((value, axis) =>
      Number((value + (followupPt[axis] - value) * progress).toFixed(3)),
    ) as Point3;
    const lesionVolumeCm3 = BASELINE_LESION_VOLUME_CM3 + (FOLLOWUP_LESION_VOLUME_CM3 - BASELINE_LESION_VOLUME_CM3) * progress;
    const fractureRiskPercent = Math.round(31 - progress * 15);
    return {
      frameIndex,
      month: Math.round(progress * 12),
      label: frameIndex === 0 ? "Baseline" : frameIndex === FRAME_COUNT - 1 ? "Follow-up" : `Month ${Math.round(progress * 12)}`,
      point,
      peakVonMisesMPa: Number((91.2 - progress * 14.6).toFixed(1)),
      fractureRiskPercent,
      corticalThicknessMm: Number((3.8 + progress * 0.5).toFixed(1)),
      lesionVolumeCm3: Number(lesionVolumeCm3.toFixed(1)),
      vtpFile: `frame-${String(frameIndex).padStart(2, "0")}.vtp`,
    };
  });
}
