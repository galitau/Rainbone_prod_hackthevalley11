import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#080d14",
        panel: "#0d141d",
        line: "#202d3a",
        ink: "#e7eef5",
        muted: "#7d91a4",
        cyan: "#4fdbd1",
        violet: "#8977f4",
        warning: "#f8bd72",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
      boxShadow: {
        glow: "0 0 32px rgba(79, 219, 209, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
