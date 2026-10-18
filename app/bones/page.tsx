import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Pelvic bones | RainbowBone",
  description: "CTPelvic1K bone meshes served from Vultr Object Storage through pre-signed URLs.",
};

export default function BonesPage() {
  return <Dashboard view="imaging" />;
}
