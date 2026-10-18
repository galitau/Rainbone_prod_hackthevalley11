"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/dashboard";
import { mockMetrics, type ClinicalMetrics } from "@/lib/mock-data";

type SimulationResponse = {
  max_von_mises_stress_mpa: number;
  average_youngs_modulus_gpa: number;
  bone_volume_cm3: number;
  fracture_risk_index_percent: number;
};

export default function Home() {
  const [metrics, setMetrics] = useState<ClinicalMetrics>(mockMetrics);
  const [simulationStatus, setSimulationStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function fetchSimulation() {
      try {
        const scan = await fetch("/sample_bone.nii.gz");
        if (!scan.ok) throw new Error("Sample scan unavailable");
        const formData = new FormData();
        formData.append("file", new File([await scan.blob()], "sample_bone.nii.gz", { type: "application/gzip" }));
        const response = await fetch("http://127.0.0.1:8000/api/simulate", { method: "POST", body: formData });
        if (!response.ok) throw new Error(`Simulation request failed (${response.status})`);
        const result = (await response.json()) as SimulationResponse;
        if (!cancelled) {
          setMetrics({
            maxStress: result.max_von_mises_stress_mpa.toFixed(1),
            youngsModulus: result.average_youngs_modulus_gpa.toFixed(1),
            boneVolume: result.bone_volume_cm3.toFixed(1),
            fractureRisk: Math.round(result.fracture_risk_index_percent),
          });
          setSimulationStatus("ready");
        }
      } catch {
        if (!cancelled) setSimulationStatus("error");
      }
    }
    void fetchSimulation();
    return () => { cancelled = true; };
  }, []);

  return <Dashboard metrics={metrics} simulationStatus={simulationStatus} />;
}
