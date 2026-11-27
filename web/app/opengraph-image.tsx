import { ImageResponse } from "next/og";

export const alt = "COUNTERSIGN: download counts can be faked. Proof of use can't.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card: the line, the seal, and what it is. Generated at build time. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#0b0c0f",
          backgroundImage: "radial-gradient(circle at 82% 30%, rgba(255,107,61,0.22), rgba(11,12,15,0) 46%)",
          color: "#edeae3",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, letterSpacing: 6, fontFamily: "sans-serif", fontWeight: 700 }}>
          <svg width="44" height="44" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10.4" fill="none" stroke="#ff6b3d" strokeWidth="1.8" />
            <path d="M8.3 12.3l2.4 2.4 5-5.4" fill="none" stroke="#ff6b3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          COUNTERSIGN
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 1.02, letterSpacing: -2 }}>
          <div style={{ display: "flex" }}>Download counts can be faked.</div>
          <div style={{ display: "flex" }}>
            Proof of use&nbsp;<span style={{ color: "#ff6b3d", fontStyle: "italic" }}>can&apos;t.</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontFamily: "sans-serif", fontSize: 26, color: "#9a9da6" }}>
          <div style={{ display: "flex", maxWidth: 820 }}>
            Proof-of-use trust for AI-agent skills: real Agent ID holders, their own on-chain sessions, verified from BNB Smart Chain data.
          </div>
          <div
            style={{
              display: "flex",
              border: "3px solid #ff6b3d",
              color: "#ff6b3d",
              borderRadius: 999,
              padding: "12px 26px",
              alignItems: "center",
              fontSize: 24,
              letterSpacing: 3,
              transform: "rotate(-8deg)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" style={{ marginRight: 10 }}>
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#ff6b3d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            VERIFIED
          </div>
        </div>
      </div>
    ),
    size,
  );
}
