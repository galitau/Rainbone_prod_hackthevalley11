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

const description =
  "For senior-living care teams: a prototype of a fall-fracture check from a hip CT, shown on one published HFValid femur with the study authors' fall-risk results. Research prototype built at Hack the Valley 11, not a medical device.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rainbone.health"),
  title: "Rainbone | Fall-fracture check prototype for care teams",
  description,
  openGraph: {
    type: "website",
    url: "https://rainbone.health",
    siteName: "Rainbone",
    title: "Rainbone: a hip CT fall-fracture check, prototyped on a published femur",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Rainbone: a hip CT fall-fracture check, prototyped on a published femur",
    description,
  },
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
