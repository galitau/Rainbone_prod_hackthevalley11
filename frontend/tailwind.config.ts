import type { Config } from "tailwindcss";

// Colors resolve to the CSS variables in app/globals.css.
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
        surface: token("surface"),
        sunken: token("sunken"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        body: token("body"),
        muted: token("muted"),
        primary: token("primary"),
        "primary-hover": token("primary-hover"),
        link: token("link"),
        focus: token("focus"),
        nav: token("nav"),
        "nav-line": token("nav-line"),
        "nav-ink": token("nav-ink"),
        "nav-muted": token("nav-muted"),
        viewport: token("viewport"),
        "viewport-line": token("viewport-line"),
        "viewport-ink": token("viewport-ink"),
        success: token("success"),
        caution: token("caution"),
        critical: token("critical"),
        spectrum: {
          violet: token("spectrum-violet"),
          blue: token("spectrum-blue"),
          cyan: token("spectrum-cyan"),
          green: token("spectrum-green"),
          amber: token("spectrum-amber"),
          orange: token("spectrum-orange"),
          red: token("spectrum-red"),
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-source-serif)", "Georgia", "serif"],
        mono: ["var(--font-ibm-plex-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(20 33 46 / 0.04), 0 1px 1px rgb(20 33 46 / 0.03)",
        raised: "0 8px 24px -8px rgb(20 33 46 / 0.12), 0 2px 4px rgb(20 33 46 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
