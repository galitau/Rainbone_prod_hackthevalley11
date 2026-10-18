import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

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
  "For senior-living care teams: turns a resident's existing hip CT into a fall-fracture check before a fall becomes an emergency. Research prototype built at Hack the Valley 11, not a medical device.";

export const metadata: Metadata = {
  title: "Rainbone | Fall-fracture check for senior-living care teams",
  description,
  openGraph: {
    type: "website",
    url: "https://rainbone.health",
    siteName: "Rainbone",
    title: "Rainbone: check a hip for fall fracture before the fall",
    description,
  },
  twitter: {
    card: "summary",
    title: "Rainbone: check a hip for fall fracture before the fall",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${inter.variable} ${sourceSerif.variable} ${plexMono.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
