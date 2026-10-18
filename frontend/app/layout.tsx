import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { PreferencesSync } from "@/lib/preferences";
import { PREFERENCES_SCRIPT } from "@/lib/preferences-script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-source-serif",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Rainbone | Clinical Biomechanics",
  description: "Patient-specific bone mechanics and finite element analysis for clinical review.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The inline script adds the saved preference classes to <html> before the first paint, hence suppressHydrationWarning.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className={`${inter.variable} ${sourceSerif.variable} ${plexMono.variable} font-sans`}>
        <PreferencesSync />
        {children}
      </body>
    </html>
  );
}
