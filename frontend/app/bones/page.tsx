import { pageMetadata } from "@/lib/seo";
import { Dashboard } from "@/components/dashboard";

export const metadata = pageMetadata("/bones");

export default function BonesPage() {
  return <Dashboard view="imaging" />;
}
