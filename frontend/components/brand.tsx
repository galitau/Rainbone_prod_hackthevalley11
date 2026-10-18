import { useId } from "react";

// Rainbone mark: a femur glyph carrying the stress spectrum along its axis —
// the same blue → red ramp the viewer uses for solved FEA fields.
export function RainboneMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Rainbone" className={className}>
      <defs>
        <linearGradient id={`${id}-spectrum`} x1="5" y1="0" x2="35" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6c4ad6" />
          <stop offset=".2" stopColor="#2f4fd8" />
          <stop offset=".38" stopColor="#12a0c4" />
          <stop offset=".55" stopColor="#3baa6e" />
          <stop offset=".72" stopColor="#f0b429" />
          <stop offset=".86" stopColor="#e86e2e" />
          <stop offset="1" stopColor="#d9412b" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="#0f1e33" />
      <g transform="rotate(-45 20 20)" fill={`url(#${id}-spectrum)`}>
        <rect x="10" y="17.4" width="20" height="5.2" rx="2.6" />
        <circle cx="9.4" cy="16.6" r="3.6" />
        <circle cx="9.4" cy="23.4" r="3.6" />
        <circle cx="30.6" cy="16.6" r="3.6" />
        <circle cx="30.6" cy="23.4" r="3.6" />
      </g>
    </svg>
  );
}

export function RainboneLogo({ tone = "dark", subtitle = "Clinical biomechanics", size = "md" }: { tone?: "dark" | "light"; subtitle?: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <div className={`flex items-center ${lg ? "gap-3.5" : "gap-3"}`}>
      <RainboneMark size={lg ? 48 : 36} />
      <div className="leading-none">
        <p className={`font-serif ${lg ? "text-[27px]" : "text-[19px]"} font-semibold tracking-[-0.01em] ${tone === "dark" ? "text-nav-ink" : "text-ink"}`}>Rainbone</p>
        <p className={`${lg ? "mt-1.5 text-[12.5px]" : "mt-1 text-[10.5px]"} font-medium tracking-[0.04em] ${tone === "dark" ? "text-nav-muted" : "text-muted"}`}>{subtitle}</p>
      </div>
    </div>
  );
}
