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

// "xl" is the landing headers' logo: 44 px mark on phones (40 px below 380 px wide, so it fits beside
// "← Back to Rainbone" at 360), 56 px from lg up. Its text sizes avoid the pixel sizes globals.css raises,
// so the class value is the rendered size.
export function RainboneLogo({ tone = "dark", subtitle = "Clinical biomechanics", size = "md" }: { tone?: "dark" | "light"; subtitle?: string; size?: "md" | "lg" | "xl" }) {
  const lg = size === "lg";
  const xl = size === "xl";
  return (
    <div className={`flex items-center ${xl ? "gap-3 max-[379px]:gap-2.5 lg:gap-4" : lg ? "gap-3.5" : "gap-3"}`}>
      <RainboneMark size={xl ? 56 : lg ? 48 : 36} className={xl ? "h-11 w-11 max-[379px]:h-10 max-[379px]:w-10 lg:h-14 lg:w-14" : ""} />
      <div className="leading-none">
        <p className={`font-serif ${xl ? "text-[24px] max-[379px]:text-[22px] lg:text-[30px]" : lg ? "text-[27px]" : "text-[19px]"} font-semibold tracking-[-0.01em] ${tone === "dark" ? "text-nav-ink" : "text-ink"}`}>Rainbone</p>
        <p className={`${xl ? "mt-1.5 whitespace-nowrap max-lg:text-[12px] max-[379px]:text-[11px] lg:text-[15px]" : lg ? "mt-1.5 text-[12.5px]" : "mt-1 text-[10.5px]"} font-medium tracking-[0.04em] ${tone === "dark" ? "text-nav-muted" : "text-muted"}`}>{subtitle}</p>
      </div>
    </div>
  );
}

// The landing hero's lockup, the biggest thing on the first screen: mark / wordmark 56 / 46 px on phones (48 / 40 below
// 380 px wide, so it still fits beside the header's Enter button), 72 / 64 from sm, 88 / 80 from lg and 112 / 104 from xl.
// Its text sizes avoid the pixel sizes globals.css raises, so the class value is the rendered size.
export function RainboneLockup({ subtitle = "Clinical biomechanics" }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 max-[379px]:gap-2.5 sm:gap-4 lg:gap-5 xl:gap-6">
      <RainboneMark size={112} className="h-14 w-14 max-[379px]:h-12 max-[379px]:w-12 sm:h-[72px] sm:w-[72px] lg:h-[88px] lg:w-[88px] xl:h-28 xl:w-28" />
      <div>
        <p className="whitespace-nowrap font-serif text-[46px] font-semibold leading-[0.9] tracking-[-0.02em] text-nav-ink max-[379px]:text-[40px] sm:text-[64px] lg:text-[80px] xl:text-[104px]">Rainbone</p>
        <p className="mt-1.5 whitespace-nowrap text-[14px] font-medium leading-[1.2] tracking-[0.04em] text-nav-muted max-[379px]:text-[12px] sm:mt-2 sm:text-[16px] xl:mt-2.5 xl:text-[18px]">{subtitle}</p>
      </div>
    </div>
  );
}
