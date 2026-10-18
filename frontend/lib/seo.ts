import type { Metadata } from "next";

export const SITE_URL = "https://rainbone.health";
export const PUBLIC_ROUTES = [
  { path: "/", title: "Rainbone | Bone research tools for care teams", description: "Bone research tools for nursing homes and senior living: nurses, CNAs, wellness directors, doctors and admin staff. Research prototype; not a medical device." },
  { path: "/dashboard", title: "Patient overview | Rainbone", description: "Inspect the published HFValid research femur in 3D, explore computed stress and read checked explanations. Research use only; not a clinical assessment." },
  { path: "/physics-simulations", title: "Physics simulations | Rainbone", description: "Explore precomputed femur compression playback and its modelling assumptions. Rainbone illustrates research mechanics, not measured patient strength." },
  { path: "/physics-simulations/report", title: "Simulation report | Rainbone", description: "Review the selected femur simulation, loading assumptions and research limitations in a printable report. Illustrative results are not clinical measurements." },
  { path: "/bones", title: "Imaging library | Rainbone", description: "Explore CTPelvic1K research bone meshes in 3D with source attribution. An imaging library for anatomy review, not a diagnostic interpretation." },
  { path: "/lesion-progression", title: "Illustrative lesion progression | Rainbone", description: "Explore interpolated research anatomy frames and a synthetic stress timeline. These illustrations do not measure disease progression or treatment response." },
  { path: "/research-paper", title: "Research paper | Rainbone", description: "Rainbone project report, Hack the Valley 11: the finite-element method, cohort comparison and rule-checked AI explanation layer behind Rainbone, with the equations the code implements. Research prototype, not a medical device." },
  { path: "/datasets", title: "Research datasets and provenance | Rainbone", description: "Review Rainbone's research sources, simulation history and checked AI provenance, including HFValid and CTPelvic1K. Understand what each dataset supports." },
  { path: "/preferences", title: "Display and accessibility preferences | Rainbone", description: "Choose Rainbone's light, dark or high-contrast theme, text size and reduced motion. Display preferences stay in your browser." },
  { path: "/privacy", title: "Privacy and demo data | Rainbone", description: "Read how the Rainbone prototype handles uploads, questions, sign-in and simulation records. Understand public demo history and data-handling limits." },
  { path: "/enter", title: "Enter the research lab | Rainbone", description: "Open Rainbone's research lab as a guest to explore bone visualizations, simulations and checked explanations. No account is required for guest access." },
] as const;

export function pageMetadata(path: string): Metadata {
  const route = PUBLIC_ROUTES.find(route => route.path === path);
  if (!route) throw new Error(`Missing public route metadata: ${path}`);
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
  const image = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: "Rainbone — bone research tools for care-team review. Research prototype." };
  return {
    title: { absolute: route.title },
    description: route.description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Rainbone", locale: "en_CA", url, title: route.title, description: route.description, images: [image] },
    twitter: { card: "summary_large_image", title: route.title, description: route.description, images: [image] },
  };
}
