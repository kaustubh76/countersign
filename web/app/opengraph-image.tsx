import { ImageResponse } from "next/og";

export const alt = "COUNTERSIGN: bots can fake downloads. Not countersigns.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card: the line, a stamped certificate corner, and the name. Generated at build time. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: "#0d0d0c", color: "#ece7dc", padding: "60px 70px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 900, letterSpacing: 1 }}>
            <svg width="40" height="40" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10.4" fill="none" stroke="#ff6b3d" strokeWidth="1.8" />
              <path d="M8.3 12.3l2.4 2.4 5-5.4" fill="none" stroke="#ff6b3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            COUNTERSIGN
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 900, lineHeight: 0.95, letterSpacing: -3 }}>
            <div style={{ display: "flex" }}>BOTS CAN FAKE</div>
            <div style={{ display: "flex" }}>DOWNLOADS.</div>
            <div style={{ display: "flex", color: "#ff6b3d" }}>NOT COUNTERSIGNS.</div>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#9b968b" }}>Proof-of-use trust for AI-agent skills · BNB Smart Chain</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 330, padding: "26px 26px", backgroundColor: "#f2ede2", color: "#191713", transform: "rotate(3deg)" }}>
            <div style={{ display: "flex", fontSize: 14, letterSpacing: 2, color: "#6f685c", borderBottom: "3px solid #191713", paddingBottom: 8 }}>SKILL CERTIFICATE</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, marginTop: 18 }}>
              <span>Downloads</span>
              <span style={{ textDecoration: "line-through", color: "#6f685c" }}>4,127</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, fontWeight: 900, marginTop: 12 }}>
              <span>Countersigns</span>
              <span>1</span>
            </div>
            <div style={{ display: "flex", marginTop: 28, alignSelf: "flex-end", border: "4px solid #1d7a45", color: "#1d7a45", borderRadius: 8, padding: "6px 16px", fontSize: 26, fontWeight: 900, letterSpacing: 4, transform: "rotate(-10deg)" }}>
              VERIFIED
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
