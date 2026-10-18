import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Preferences | Rainbone",
  description: "Text size, motion and the overview's live engine check, saved in this browser.",
};

export default function PreferencesPage() {
  return <Dashboard view="preferences" />;
}
