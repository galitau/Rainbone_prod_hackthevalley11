import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(({ path }) => ({ url: new URL(path, "https://rainbone.health").href }));
}
