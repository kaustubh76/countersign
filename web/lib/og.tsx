import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Colours of the "notarized document" system, for the share cards (satori can't read CSS variables). */
export const OG = {
  ink: "#0d0d0c",
  text: "#ece7dc",
  muted: "#9b968b",
  paper: "#f2ede2",
  paperInk: "#191713",
  paperMuted: "#6f685c",
  paperRule: "#cbc2b0",
  pen: "#1d3f9e",
  seal: "#ff6b3d",
  sealPaper: "#d23a1f",
  bad: "#f0435b",
  badPaper: "#c0273f",
  ok: "#36c27a",
  okPaper: "#1d7a45",
} as const;

export const OG_SIZE = { width: 1200, height: 630 };

type Weight = 500 | 600 | 900;
export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: Weight;
  style: "normal";
}

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

let fonts: Promise<OgFont[] | undefined> | null = null;

/**
 * The site's condensed caps ("Caps"), its mono ("Mono") and the red-pen hand ("Hand"), from web/assets/og.
 * Read once per process. Undefined (so next/og falls back to its default font) if a file can't be read.
 */
export function ogFonts(): Promise<OgFont[] | undefined> {
  fonts ??= (async () => {
    const dir = join(process.cwd(), "assets/og");
    try {
      const [caps, mono, hand] = await Promise.all(
        ["archivo-extracondensed-black.ttf", "IBMPlexMono-Medium.ttf", "caveat-semibold.ttf"].map((f) => readFile(join(dir, f))),
      );
      return [
        { name: "Caps", data: toArrayBuffer(caps!), weight: 900, style: "normal" },
        { name: "Mono", data: toArrayBuffer(mono!), weight: 500, style: "normal" },
        { name: "Hand", data: toArrayBuffer(hand!), weight: 600, style: "normal" },
      ];
    } catch {
      return undefined;
    }
  })();
  return fonts;
}

/** The seal mark (ring + tick) used on every card. */
export function OgMark({ size = 40, color = OG.seal }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10.4" fill="none" stroke={color} strokeWidth="1.8" />
      <path d="M8.3 12.3l2.4 2.4 5-5.4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A hand-drawn red-pen stroke across a box (viewBox matches the box, so nothing stretches). */
export function OgStrike({ width, height, color = OG.bad, stroke = 9 }: { width: number; height: number; color?: string; stroke?: number }) {
  const y = height / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={`M4 ${y + height * 0.18} C${width * 0.25} ${y - height * 0.08} ${width * 0.5} ${y + height * 0.12} ${width * 0.72} ${y - height * 0.06} C${width * 0.84} ${y - height * 0.14} ${width * 0.93} ${y - height * 0.1} ${width - 4} ${y - height * 0.2}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A loose red-pen ring. */
export function OgRing({ width, height, color = OG.sealPaper, stroke = 4 }: { width: number; height: number; color?: string; stroke?: number }) {
  const w = width;
  const h = height;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path
        d={`M${w * 0.55} ${h * 0.08} C${w * 0.2} ${h * 0.04} ${w * 0.04} ${h * 0.3} ${w * 0.05} ${h * 0.52} C${w * 0.06} ${h * 0.84} ${w * 0.4} ${h * 0.96} ${w * 0.62} ${h * 0.92} C${w * 0.9} ${h * 0.86} ${w * 0.97} ${h * 0.62} ${w * 0.95} ${h * 0.4} C${w * 0.92} ${h * 0.14} ${w * 0.66} ${h * 0.05} ${w * 0.42} ${h * 0.12}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A red cross for a punched slot (✗ drawn as paths: the fonts are subsets). */
export function OgCross({ size = 30, color = OG.badPaper }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M5 5l14 14M19 5L5 19" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
