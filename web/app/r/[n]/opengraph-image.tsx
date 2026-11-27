import { ImageResponse } from "next/og";
import { parseScore } from "@/lib/score";
import { SCENARIOS } from "@/lib/sim/scenarios";

const MAX = SCENARIOS.filter((s) => s.group === "fake").length;

export const alt = "COUNTERSIGN playground score";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card for /r/<n>: n of the fakes tried, each slot crossed out, and a green "0 counted" stamp. */
export default async function ScoreImage({ params }: { params: Promise<{ n: string }> }) {
  const n = parseScore((await params).n, MAX) ?? MAX;
  const slots = Array.from({ length: MAX }, (_, i) => i < n);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: "#0d0d0c", color: "#ece7dc", padding: "56px 70px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 900, letterSpacing: 1 }}>
          <svg width="40" height="40" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10.4" fill="none" stroke="#ff6b3d" strokeWidth="1.8" />
            <path d="M8.3 12.3l2.4 2.4 5-5.4" fill="none" stroke="#ff6b3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          COUNTERSIGN
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 900, lineHeight: 1, letterSpacing: -2 }}>
          <div style={{ display: "flex" }}>{`I TRIED ${n} OF ${MAX} WAYS`}</div>
          <div style={{ display: "flex" }}>TO FAKE A COUNTERSIGN.</div>
          <div style={{ display: "flex", color: "#ff6b3d" }}>NONE COUNTED.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f2ede2", padding: "22px 26px" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {slots.map((done, i) => (
              <div key={i} style={{ display: "flex", width: 52, height: 52, alignItems: "center", justifyContent: "center", border: done ? "3px solid #c0273f" : "3px dashed #cbc2b0", borderRadius: 6 }}>
                {done ? (
                  <svg width="30" height="30" viewBox="0 0 24 24">
                    <path d="M5 5l14 14M19 5L5 19" stroke="#c0273f" strokeWidth="3.2" strokeLinecap="round" />
                  </svg>
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", border: "5px solid #1d7a45", color: "#1d7a45", borderRadius: 8, padding: "6px 16px", fontSize: 32, fontWeight: 900, letterSpacing: 2, transform: "rotate(-6deg)" }}>0 COUNTED</div>
        </div>
      </div>
    ),
    size,
  );
}
