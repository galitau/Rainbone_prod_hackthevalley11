import type { NextConfig } from "next";

// API_PROXY_TARGET (e.g. https://api.rainbone.health) makes this site forward /api/* and /health to the backend,
// so the browser only talks to the site's own origin (no separate API hostname to resolve, no CORS).
// Point NEXT_PUBLIC_API_BASE_URL at the site itself when it is set. Unset, nothing is proxied.
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` },
      { source: "/health", destination: `${apiProxyTarget}/health` },
    ];
  },
};

export default nextConfig;
