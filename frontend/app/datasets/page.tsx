import { pageMetadata } from "@/lib/seo";
import { Dashboard } from "@/components/dashboard";

export const metadata = pageMetadata("/datasets");

export default function DatasetsPage() {
  return <Dashboard view="datasets" />;
}
