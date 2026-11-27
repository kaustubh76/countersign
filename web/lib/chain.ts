import { unstable_cache } from "next/cache";
import { AGENT_ID_BSC } from "@countersign/core";
import { chainId, deployment, reader } from "./data";

/** A small, cheap "is this thing live?" read of BNB Smart Chain: block height + the Agent ID registry. */
export interface ChainPulse {
  chainId: number;
  block: string | null;
  registry: { address: string; name: string | null };
  deployed: boolean;
  contracts: { skillRegistry: string; countersign: string } | null;
  at: string;
  error?: string;
}

const NAME_ABI = [{ type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }] as const;

const registryName = unstable_cache(
  async (): Promise<string | null> => {
    const name = await reader().client.readContract({ address: AGENT_ID_BSC, abi: NAME_ABI, functionName: "name" });
    return String(name).slice(0, 64);
  },
  ["agent-id-registry-name-v1"],
  { revalidate: 86_400 },
);

export async function getChainPulse(): Promise<ChainPulse> {
  const d = deployment();
  const base: ChainPulse = {
    chainId: chainId(),
    block: null,
    registry: { address: d?.agentId ?? AGENT_ID_BSC, name: null },
    deployed: Boolean(d),
    contracts: d ? { skillRegistry: d.skillRegistry, countersign: d.countersign } : null,
    at: new Date().toISOString(),
  };
  const [block, name] = await Promise.allSettled([reader().getBlockNumber(), registryName()]);
  if (block.status === "fulfilled") base.block = block.value.toString();
  else base.error = "chain unreachable";
  if (name.status === "fulfilled") base.registry.name = name.value;
  return base;
}
