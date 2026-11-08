import { ImageResponse } from "next/og";
import { brand } from "@/lib/site";

// The share card for seylo.dev links (chat apps, X, LinkedIn): the mark, the name and the tagline.
export const alt = `${brand.name}: ${brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "84px 96px",
        background: "#0B0D12",
        color: "#F5F7FA",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <svg width="104" height="104" viewBox="0 0 28 28" aria-hidden="true">
          <rect width="28" height="28" rx="7" fill="#2563EB" />
          <rect x="5.5" y="6.25" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
          <rect x="9" y="12" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
          <rect x="5.5" y="17.75" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
        </svg>
        <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.02em" }}>{brand.name}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{brand.tagline}</span>
        <span style={{ fontSize: 30, color: "#A8B0BF", lineHeight: 1.4, maxWidth: 980 }}>{brand.description}</span>
      </div>
    </div>,
    size,
  );
}
