import { NextResponse } from "next/server";
import { getChainPulse } from "@/lib/chain";

export const dynamic = "force-dynamic";

/** GET /api/v1/chain: current BNB Smart Chain block, the Agent ID registry, and whether COUNTERSIGN is deployed. */
export async function GET() {
  const pulse = await getChainPulse();
  return NextResponse.json(pulse, {
    status: pulse.block ? 200 : 503,
    headers: { "Cache-Control": "public, s-maxage=4, stale-while-revalidate=30" },
  });
}
