/**
 * Opt-in: RUN_NET_TESTS=1 pnpm --filter @countersign/redline test
 * RL4 against real BNB Smart Chain contracts and their verified source on Sourcify (keyless).
 */
import { describe, expect, it } from "vitest";
import { getAddress, type Address, type Hex } from "viem";
import { analyzeContracts, type FetchSourcesOptions } from "../src/sources.js";

const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}
const chain: FetchSourcesOptions = {
  chainId: 56,
  getCode: (a: Address) => rpc<Hex>("eth_getCode", [a, "latest"]),
  getStorageAt: (a: Address, slot: Hex) => rpc<Hex>("eth_getStorageAt", [a, slot, "latest"]),
  readOwner: async (a: Address) => {
    try {
      const word = await rpc<Hex>("eth_call", [{ to: a, data: "0x8da5cb5b" }, "latest"]);
      return word && word.length >= 66 ? getAddress(`0x${word.slice(-40)}`) : null;
    } catch {
      return null;
    }
  },
  timeoutMs: 30_000,
};

describe.skipIf(!process.env.RUN_NET_TESTS)("RL4 live on BNB Smart Chain (Sourcify)", () => {
  it("the Agent ID registry: adminRegister is an owner mint power", async () => {
    const [c] = await analyzeContracts([getAddress("0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F")], chain);
    expect(c).toMatchObject({ status: "verified", provider: "sourcify", contractName: "HandleRegistry" });
    expect(c!.powers).toEqual(expect.arrayContaining([expect.objectContaining({ category: "mint", fn: "adminRegister", guard: "onlyOwner" })]));
    expect(c!.others).toEqual(expect.arrayContaining(["setSigner"]));
  }, 60_000);

  it("USDC on BSC: an EIP-1967 proxy whose admin can replace the code; its implementation is analysed", async () => {
    const [c] = await analyzeContracts([getAddress("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d")], chain);
    expect(c!.proxy?.kind).toBe("eip1967");
    expect(c!.powers.map((p) => p.category)).toContain("upgrade");
    expect(c!.implementation?.status).toBe("verified");
    expect(c!.implementation!.powers.map((p) => p.category)).toEqual(expect.arrayContaining(["mint"]));
  }, 60_000);
});
