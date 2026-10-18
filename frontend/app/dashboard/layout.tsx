import type { Metadata } from "next";

export const metadata: Metadata = { title: "Patient overview | Rainbone" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
