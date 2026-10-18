import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Preferences | Rainbone",
  description: "Choose a light, dark, high-contrast or system theme, adjust text and motion, and save your preferences in this browser.",
};

export default function PreferencesPage() {
  return <Dashboard view="preferences" />;
}
