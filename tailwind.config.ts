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
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "ui-monospace", "monospace"],
      },
      // Each size about 15% above Tailwind's default, so the whole dashboard reads bigger in proportion.
      fontSize: {
        xs: ["0.875rem", { lineHeight: "1.25rem" }],
        sm: ["1rem", { lineHeight: "1.5rem" }],
        base: ["1.125rem", { lineHeight: "1.75rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        xl: ["1.4375rem", { lineHeight: "2rem" }],
        "2xl": ["1.75rem", { lineHeight: "2.25rem" }],
        "3xl": ["2.125rem", { lineHeight: "2.5rem" }],
        "4xl": ["2.625rem", { lineHeight: "1" }],
      },
      boxShadow: {
        glow: "0 0 32px rgba(79, 219, 209, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
