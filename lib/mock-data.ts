export type ClinicalMetrics = {
  maxStress: string;
  youngsModulus: string;
  boneVolume: string;
  fractureRisk: number;
};

export const mockMetrics: ClinicalMetrics = {
  maxStress: "126.4",
  youngsModulus: "17.8",
  boneVolume: "184.2",
  fractureRisk: 68,
};

export const mockStressSeries = [
  { label: "Jan", value: 62 }, { label: "Feb", value: 71 },
  { label: "Mar", value: 68 }, { label: "Apr", value: 84 },
  { label: "May", value: 78 }, { label: "Jun", value: 93 },
  { label: "Jul", value: 87 }, { label: "Aug", value: 108 },
  { label: "Sep", value: 99 }, { label: "Oct", value: 126 },
];
