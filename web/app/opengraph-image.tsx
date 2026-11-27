import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgMark, ogFonts, OgRing, OgStrike } from "@/lib/og";

export const alt = "COUNTERSIGN: bots can fake downloads. Not countersigns.";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Share card: the headline in the site's condensed caps, "downloads" struck in red pen, and the demo certificate after the bots. */
export default async function OpenGraphImage() {
  const mono = { fontFamily: "Mono" };
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: OG.ink, color: OG.text, padding: "50px 64px", fontFamily: "Caps" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 610 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, letterSpacing: 1 }}>
            <OgMark size={38} />
            COUNTERSIGN
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 96, lineHeight: 0.92 }}>
            <div style={{ display: "flex" }}>BOTS CAN FAKE</div>
            <div style={{ display: "flex", position: "relative" }}>
              DOWNLOADS.
              <div style={{ display: "flex", position: "absolute", left: -8, top: 22 }}>
                <OgStrike width={430} height={40} />
              </div>
            </div>
            <div style={{ display: "flex", color: OG.seal }}>NOT</div>
            <div style={{ display: "flex", color: OG.seal }}>COUNTERSIGNS.</div>
          </div>
          <div style={{ display: "flex", ...mono, fontSize: 20, color: OG.muted }}>proof of use for AI-agent skills · BNB Smart Chain</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 410, padding: "26px 28px 30px", backgroundColor: OG.paper, color: OG.paperInk, transform: "rotate(2.5deg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 13, letterSpacing: 2, color: OG.paperMuted, borderBottom: `3px solid ${OG.paperInk}`, paddingBottom: 8 }}>
              <span>SKILL CERTIFICATE</span>
              <span>DEMO</span>
            </div>
            <div style={{ display: "flex", fontSize: 50, marginTop: 14 }}>
              DCA-PLANNER <span style={{ color: OG.paperMuted, marginLeft: 12 }}>V1.2</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...mono, fontSize: 21, marginTop: 18, paddingBottom: 10, borderBottom: `1px solid ${OG.paperRule}` }}>
              <span>Downloads</span>
              <div style={{ display: "flex", position: "relative" }}>
                5,127
                <div style={{ display: "flex", position: "absolute", left: -8, top: 4 }}>
                  <OgStrike width={84} height={22} color={OG.sealPaper} stroke={4} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...mono, fontSize: 21, marginTop: 12, paddingBottom: 10, borderBottom: `1px solid ${OG.paperRule}` }}>
              <span>Countersigns</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: "Hand", fontSize: 30, color: OG.sealPaper, transform: "rotate(-7deg)" }}>still 0</span>
                <div style={{ display: "flex", position: "relative", width: 56, height: 48, alignItems: "center", justifyContent: "center", fontSize: 34 }}>
                  0
                  <div style={{ display: "flex", position: "absolute", left: 0, top: 0 }}>
                    <OgRing width={56} height={48} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 26, alignSelf: "flex-end", border: `4px solid ${OG.badPaper}`, color: OG.badPaper, borderRadius: 8, padding: "6px 16px", ...mono, fontSize: 24, letterSpacing: 4, transform: "rotate(-8deg)" }}>
              REFUSED ×1,000
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
