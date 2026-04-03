import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const logoUrl = `${url.protocol}//${url.host}/logo-256.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0f",
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        {/* Grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(0, 212, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.05) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          width={100}
          height={100}
          style={{ marginBottom: 30 }}
        />

        {/* Title */}
        <div
          style={{
            color: "#00d4ff",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "12px",
            textShadow: "0 0 30px rgba(0, 212, 255, 0.3)",
            marginBottom: 12,
          }}
        >
          PANTAULAH
        </div>

        {/* Subtitle */}
        <div
          style={{
            color: "#4a5568",
            fontSize: 18,
            letterSpacing: "6px",
          }}
        >
          MALAYSIA INTELLIGENCE TERMINAL
        </div>

        {/* Bottom stats line */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            gap: 40,
            color: "#4a5568",
            fontSize: 14,
            letterSpacing: "2px",
          }}
        >
          <span>16 STATES</span>
          <span style={{ color: "rgba(0, 212, 255, 0.3)" }}>|</span>
          <span>5 DATASETS</span>
          <span style={{ color: "rgba(0, 212, 255, 0.3)" }}>|</span>
          <span>AI-POWERED ANALYSIS</span>
          <span style={{ color: "rgba(0, 212, 255, 0.3)" }}>|</span>
          <span>REAL-TIME NEWS</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
