import type { Config } from "tailwindcss";

// Colours are CSS variables (app/globals.css) so the page can be light while the 3D viewer
// keeps its dark stage: `.theme-stage` redefines the same tokens for everything inside it.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        panel: token("panel"),
        line: token("line"),
        ink: token("ink"),
        muted: token("muted"),
        cyan: token("cyan"),
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        // accent is the page's primary colour; it is the same variable as `cyan`, which the viewer uses.
        accent: { DEFAULT: token("cyan"), soft: token("accent-soft") },
        ok: token("ok"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        label: ["0.75rem", { lineHeight: "1rem" }],
        caption: ["0.8125rem", { lineHeight: "1.25rem" }],
        lead: ["0.9375rem", { lineHeight: "1.5rem" }],
        metric: ["1.75rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
      },
      backgroundImage: {
        // The viewer's stress/displacement colour scale (low → high), reused as the brand mark.
        rainbow: "linear-gradient(135deg, #294dd9 0%, #1acce6 30%, #59e68c 55%, #ffcc33 78%, #f23d30 100%)",
        // The same scale left to right with BoneViewer's evenly spaced stops, for keys that match its legend.
        "rainbow-x": "linear-gradient(to right, #294dd9, #1acce6, #59e68c, #ffcc33, #f23d30)",
      },
      boxShadow: {
        glow: "0 1px 2px rgb(19 32 58 / 0.06), 0 12px 32px -16px rgb(19 32 58 / 0.28)",
        card: "0 1px 2px rgb(19 32 58 / 0.05), 0 8px 24px -16px rgb(19 32 58 / 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
