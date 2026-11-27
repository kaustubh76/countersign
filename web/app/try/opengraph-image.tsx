import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgCross, OgMark, ogFonts } from "@/lib/og";
import { SCENARIOS } from "@/lib/sim/scenarios";

export const alt = "Try to fake a countersign: eleven attacks against the real verifier. None count.";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Share card for /try: the dare, and a punch card that is part punched, part waiting for you. */
export default async function TryImage() {
  const max = SCENARIOS.filter((s) => s.group === "fake").length;
  const punched = 6;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: OG.ink, color: OG.text, padding: "50px 64px", fontFamily: "Caps" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, letterSpacing: 1 }}>
          <OgMark size={38} />
          COUNTERSIGN
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 150, lineHeight: 0.9 }}>TRY TO FAKE ONE.</div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 26, color: OG.muted, marginTop: 14 }}>{`${max} attacks · the real verifier · none count`}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: OG.paper, padding: "22px 26px" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {Array.from({ length: max }, (_, i) => (
              <div key={i} style={{ display: "flex", width: 58, height: 58, alignItems: "center", justifyContent: "center", border: i < punched ? `3px solid ${OG.badPaper}` : `3px dashed ${OG.paperRule}`, borderRadius: 6 }}>
                {i < punched ? <OgCross size={28} /> : null}
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
