import { getAddress, type Address } from "viem";
import { AGENT_ID_BSC, BSC_CHAIN_ID } from "./constants.js";

export interface Deployment {
  chainId: number;
  agentId: Address;
  skillRegistry: Address;
  countersign: Address;
  /** First block worth scanning for this deployment (registry creation). */
  deployBlock: bigint;
}

/**
 * Known deployments. BSC mainnet is filled in from the broadcast of contracts/script/Deploy.s.sol;
 * until then it is absent and callers must pass addresses explicitly (or load a local file).
 */
export const DEPLOYMENTS: Partial<Record<number, Deployment>> = {};

export function getDeployment(chainId: number = BSC_CHAIN_ID): Deployment {
  const d = DEPLOYMENTS[chainId];
  if (!d) throw new Error(`no COUNTERSIGN deployment known for chain ${chainId}`);
  return d;
}

/** Parse the JSON written by Deploy.s.sol / DeployLocal.s.sol (contracts/deployments/<chainId>.json). */
export function parseDeploymentJson(json: unknown): Deployment {
  const j = json as Record<string, unknown>;
  const addr = (k: string): Address => {
    const v = j[k];
    if (typeof v !== "string") throw new Error(`deployment JSON: missing ${k}`);
    return getAddress(v);
  };
  const chainId = Number(j.chainId);
  const deployment: Deployment = {
    chainId,
    agentId: addr("agentId"),
    skillRegistry: addr("skillRegistry"),
    countersign: addr("countersign"),
    deployBlock: BigInt(String(j.deployBlock ?? 0)),
  };
  if (chainId === BSC_CHAIN_ID && deployment.agentId !== AGENT_ID_BSC) {
    throw new Error("deployment JSON for chain 56 does not point at the real Agent ID registry");
  }
  return deployment;
}
