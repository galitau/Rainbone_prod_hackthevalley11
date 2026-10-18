import { pageMetadata } from "@/lib/seo";
import { Dashboard } from "@/components/dashboard";

export const metadata = pageMetadata("/lesion-progression");

export default function LesionProgressionPage() {
  return <Dashboard view="progression" />;
}
