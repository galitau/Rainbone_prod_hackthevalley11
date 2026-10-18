import { pageMetadata } from "@/lib/seo";
import { Dashboard } from "@/components/dashboard";

export const metadata = pageMetadata("/preferences");

export default function PreferencesPage() {
  return <Dashboard view="preferences" />;
}
