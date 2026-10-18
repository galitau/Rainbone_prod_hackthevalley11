import type { Metadata } from "next";
import { CloudBones } from "@/components/CloudBones";

export const metadata: Metadata = {
  title: "Pelvic bones | RainbowBone",
  description: "CTPelvic1K bone meshes served from Vultr Object Storage through pre-signed URLs.",
};

export default function BonesPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-6 font-sans text-ink sm:px-8">
      <CloudBones />
    </main>
  );
}
