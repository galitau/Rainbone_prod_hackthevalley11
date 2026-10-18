import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Rainbone — explore bone vulnerability. Research prototype for care-team review.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const mark = await readFile(join(process.cwd(), "app/icon.svg"));
  const markUrl = `data:image/svg+xml;base64,${mark.toString("base64")}`;
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f6f2", color: "#0f1e33", position: "relative" }}>
      <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "linear-gradient(90deg, #6c4ad6, #2f4fd8, #12a0c4, #3baa6e, #f0b429, #e86e2e, #d9412b)" }} />
      <div style={{ display: "flex", flexDirection: "column", padding: "56px 64px", width: 850 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Same spectrum mark as the application; no simulated anatomy in the preview. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markUrl} width={68} height={68} alt="" />
          <span style={{ fontSize: 49, fontWeight: 700 }}>Rainbone</span>
        </div>
        <div style={{ display: "flex", marginTop: 44, fontSize: 18, letterSpacing: 3, color: "#52677b" }}>FOR CARE-TEAM REVIEW</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 73, lineHeight: 1.08, fontWeight: 700, letterSpacing: -2 }}>Explore bone vulnerability.</div>
        <div style={{ display: "flex", marginTop: 25, fontSize: 27, lineHeight: 1.35, color: "#42566b" }}>CT-derived mechanics, made understandable.</div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 19, color: "#52677b" }}>Research prototype · not a medical device</div>
      </div>
      <div style={{ display: "flex", width: 350, background: "#0f1e33", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 30 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markUrl} width={250} height={250} alt="" />
        <div style={{ display: "flex", color: "#f7f6f2", fontSize: 28, marginTop: 36 }}>rainbone.health</div>
      </div>
    </div>,
    size,
  );
}
