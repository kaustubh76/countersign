import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgCross, OgMark, ogFonts } from "@/lib/og";
import { parseScore } from "@/lib/score";
import { SCENARIOS } from "@/lib/sim/scenarios";

const MAX = SCENARIOS.filter((s) => s.group === "fake").length;

export const alt = "COUNTERSIGN playground score";
export const size = OG_SIZE;
export const contentType = "image/png";

// All eleven cards render at build time (nothing reads the font files at request time).
export const dynamicParams = false;
export function generateStaticParams() {
  return Array.from({ length: MAX }, (_, i) => ({ n: String(i + 1) }));
}

/** Share card for /r/<n>: n of the fakes tried, each slot crossed out, and a green "0 counted" stamp. */
export default async function ScoreImage({ params }: { params: Promise<{ n: string }> }) {
  const n = parseScore((await params).n, MAX) ?? MAX;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: OG.ink, color: OG.text, padding: "50px 64px", fontFamily: "Caps" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, letterSpacing: 1 }}>
          <OgMark size={38} />
          COUNTERSIGN
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, lineHeight: 0.92 }}>
          <div style={{ display: "flex" }}>{`I TRIED ${n} OF ${MAX} WAYS`}</div>
          <div style={{ display: "flex" }}>TO FAKE A COUNTERSIGN.</div>
          <div style={{ display: "flex", color: OG.seal }}>NONE COUNTED.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: OG.paper, padding: "22px 26px" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {Array.from({ length: MAX }, (_, i) => (
              <div key={i} style={{ display: "flex", width: 58, height: 58, alignItems: "center", justifyContent: "center", border: i < n ? `3px solid ${OG.badPaper}` : `3px dashed ${OG.paperRule}`, borderRadius: 6 }}>
                {i < n ? <OgCross size={28} /> : null}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexShrink: 0, border: `5px solid ${OG.okPaper}`, color: OG.okPaper, borderRadius: 8, padding: "6px 16px", fontSize: 40, letterSpacing: 2, transform: "rotate(-6deg)" }}>0 COUNTED</div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
