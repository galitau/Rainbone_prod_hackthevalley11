import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "RainbowBone | Bone stress simulation",
  description:
    "Finite-element stress simulation of a patient-derived femur, explained in plain words. Research prototype, not a medical device.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables sit on <html> because Tailwind's base styles set the font family there.
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body suppressHydrationWarning className="font-sans">
        {children}
      </body>
    </html>
  );
}
