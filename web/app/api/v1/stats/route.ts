import { NextResponse } from "next/server";
import { getIndex } from "@/lib/data";

export const revalidate = 60;

/** GET /api/v1/stats: totals across the registry. */
export async function GET() {
  const { chainId, deployed, contracts, computedAt, computedAtBlock, uniqueAgents, totals, error } = await getIndex();
  return NextResponse.json(
    { chainId, deployed, contracts, computedAt, computedAtBlock, uniqueAgents, totals, error },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
