import type { VersionSummary } from "./data";

const COLORS = {
  ok: "#1a7f37",
  unproven: "#6e7781",
  warning: "#9a6700",
  incident: "#cf222e",
  unknown: "#6e7781",
} as const;

function textWidth(s: string): number {
  // Verdana 11px approximation (shields.io style)
  let w = 0;
  for (const ch of s) w += /[ilI.,:;'|!]/.test(ch) ? 3.5 : /[mwMW@]/.test(ch) ? 10 : /[A-Z0-9]/.test(ch) ? 7.5 : 6.5;
  return Math.ceil(w);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function badgeSvg(v: VersionSummary | null): string {
  const left = "countersign";
  let right: string;
  let color: string;
  if (!v) {
    right = "not registered";
    color = COLORS.unknown;
  } else if (v.incidents > 0) {
    right = `${v.incidents} verified incident${v.incidents === 1 ? "" : "s"}`;
    color = COLORS.incident;
  } else {
    right = `${v.counted} verified · 0 incidents`;
    color = v.status === "ok" ? COLORS.ok : v.status === "warning" ? COLORS.warning : COLORS.unproven;
  }
  const lw = textWidth(left) + 12;
  const rw = textWidth(right) + 12;
  const w = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(`${left}: ${right}`)}">
<title>${esc(`${left}: ${right}`)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#24292f"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(left)}</text><text x="${lw + rw / 2}" y="14">${esc(right)}</text></g>
</svg>`;
}
