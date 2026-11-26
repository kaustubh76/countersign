import { NextResponse } from "next/server";
import { getIndex } from "@/lib/data";

export const revalidate = 60;

/** GET /api/v1/versions: every registered version with its verified counts. No wallets, no names of people. */
export async function GET() {
  const index = await getIndex();
  return NextResponse.json(
    {
      chainId: index.chainId,
      computedAt: index.computedAt,
      computedAtBlock: index.computedAtBlock,
      versions: index.versions.map(({ report: _report, ...v }) => v),
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
