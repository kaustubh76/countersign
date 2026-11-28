import { unstable_cache } from "next/cache";
import type { Address } from "viem";
import { analyzeContracts, type AnalyzedContract } from "@countersign/redline/sources";
import { reader } from "./data";

/** Server-only: RL4's contract lookups for /api/v1/check, on BNB Smart Chain. Counts and code, nothing personal. */

const OWNER_ABI = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

async function analyzeLive(address: Address): Promise<AnalyzedContract> {
  const r = reader();
  const [c] = await analyzeContracts([address], {
    chainId: r.chainId,
    getCode: (a) => r.getCode(a),
    getStorageAt: (a, slot) => r.getStorageAt(a, slot),
    readOwner: async (a) => {
      try {
        return await r.client.readContract({ address: a, abi: OWNER_ABI, functionName: "owner" });
      } catch {
        return null;
      }
    },
    ...(process.env.ETHERSCAN_API_KEY ? { etherscanKey: process.env.ETHERSCAN_API_KEY } : {}),
  });
  return c!;
}

class NotCached extends Error {
  constructor(readonly result: AnalyzedContract) {
    super("not cached");
  }
}

/** Verified source rarely changes, so definite answers are cached for 10 minutes; "unavailable" never is. */
const cached = (address: Address) =>
  unstable_cache(
    async (): Promise<AnalyzedContract> => {
      const c = await analyzeLive(address);
      if (c.status === "unavailable") throw new NotCached(c);
      return c;
    },
    ["rl4-contract-v1", address.toLowerCase()],
    { revalidate: 600 },
  )();

export async function analyzeForCheck(addresses: readonly Address[]): Promise<AnalyzedContract[]> {
  return Promise.all(
    addresses.map((a) =>
      cached(a).catch((e: unknown) =>
        e instanceof NotCached ? e.result : ({ address: a, status: "unavailable", powers: [], others: [], detail: (e as Error).message } as AnalyzedContract),
      ),
    ),
  );
}

export const RL4_CHAIN_ID = 56;
