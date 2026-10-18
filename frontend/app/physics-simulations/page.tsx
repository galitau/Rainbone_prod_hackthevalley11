import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Physics simulations | Rainbone" };

export default function PhysicsPage() {
  return <Dashboard view="physics" />;
}
