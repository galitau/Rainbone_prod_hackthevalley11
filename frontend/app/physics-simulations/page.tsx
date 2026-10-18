import { pageMetadata } from "@/lib/seo";
import { Dashboard } from "@/components/dashboard";

export const metadata = pageMetadata("/physics-simulations");

export default function PhysicsPage() {
  return <Dashboard view="physics" />;
}
