import { badgeSvg } from "@/lib/badge";
import { getVersionSummary } from "@/lib/data";

export const revalidate = 60;

/** GET /api/v1/badge/<versionId>(.svg): a shields-style badge for READMEs and marketplaces. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const versionId = id.replace(/\.svg$/, "");
  const v = /^0x[0-9a-fA-F]{64}$/.test(versionId) ? await getVersionSummary(versionId) : null;
  return new Response(badgeSvg(v), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
