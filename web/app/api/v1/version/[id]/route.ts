import { NextResponse } from "next/server";
import { getIndex } from "@/lib/data";

export const revalidate = 60;

/** GET /api/v1/version/<versionId>: the verified report for one version (counts only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return NextResponse.json({ error: "versionId must be 0x + 64 hex" }, { status: 400 });
  const index = await getIndex();
  const v = index.versions.find((x) => x.versionId.toLowerCase() === id.toLowerCase());
  if (!v) return NextResponse.json({ error: "not registered (or registered after the last refresh, up to 60 s ago)" }, { status: 404 });
  return NextResponse.json(
    { chainId: index.chainId, computedAt: index.computedAt, version: { ...v, report: undefined }, report: v.report },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
