import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Secure datasets | Rainbone",
  description: "Where Rainbone's research datasets come from, where they are stored and what happens to an imported scan.",
};

export default function DatasetsPage() {
  return <Dashboard view="datasets" />;
}
