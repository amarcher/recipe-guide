import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Recipe Guide — recipes, standardized";
export const runtime = "nodejs";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "72px",
          background:
            "linear-gradient(135deg, #fafaf9 0%, #f5f5f4 50%, #e7e5e4 100%)",
          color: "#1c1917",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#1c1917",
              color: "#fafaf9",
              fontSize: 36,
            }}
          >
            ◔
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>
            Recipe Guide
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Every recipe on one screen.
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#57534e",
              lineHeight: 1.35,
              maxWidth: 900,
            }}
          >
            Mise en place, timers that alarm when a step is ready, scaling,
            shared family libraries.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#78716c",
            fontSize: 22,
          }}
        >
          <div>mised.tech</div>
          <div>Paste a URL · save · cook</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
