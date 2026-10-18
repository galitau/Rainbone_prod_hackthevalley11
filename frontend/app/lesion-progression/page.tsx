import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Lesion progression | Rainbone",
  description: "Review cached baseline-to-follow-up lesion progression frames.",
};

export default function LesionProgressionPage() {
  return <Dashboard view="progression" />;
}
