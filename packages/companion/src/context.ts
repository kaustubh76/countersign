import { readFile } from "node:fs/promises";
import { getAddress, type Address } from "viem";
import {
  BSC_CHAIN_ID,
  createReader,
  DEPLOYMENTS,
  parseDeploymentJson,
  rpcUrlsFromEnv,
  type ChainReader,
  type Deployment,
} from "@countersign/core";
import { flag, type Args } from "./args.js";

export interface Context {
  chainId: number;
  deployment: Deployment;
  reader: ChainReader;
  apiBase: string;
}

/** Public badge/API site. Pre-flight works without it (--verify-local); it is a cache, not a trust anchor. */
export const DEFAULT_API = "https://countersign.vercel.app";

export async function loadContext(args: Args): Promise<Context> {
  const chainId = Number(flag(args, "chain") ?? process.env.COUNTERSIGN_CHAIN_ID ?? BSC_CHAIN_ID);
  const file = flag(args, "deployment") ?? process.env.COUNTERSIGN_DEPLOYMENT;
  let deployment: Deployment | undefined;
  if (file) {
    deployment = parseDeploymentJson(JSON.parse(await readFile(file, "utf8")));
  } else {
    deployment = DEPLOYMENTS[chainId];
  }
  if (!deployment) {
    throw new UsageError(
      `no COUNTERSIGN deployment is known for chain ${chainId}; pass --deployment <contracts/deployments/<id>.json>`,
    );
  }
  if (deployment.chainId !== chainId) {
    throw new UsageError(`deployment file is for chain ${deployment.chainId}, not ${chainId}`);
  }
  const rpc = flag(args, "rpc");
  const reader = createReader({ chainId, rpcUrls: rpc ? rpc.split(",") : rpcUrlsFromEnv() });
  return {
    chainId,
    deployment,
    reader,
    apiBase: flag(args, "api") ?? process.env.COUNTERSIGN_API ?? DEFAULT_API,
  };
}

export class UsageError extends Error {
  override name = "UsageError";
}

export function addressArg(value: string | undefined, what: string): Address {
  if (!value) throw new UsageError(`missing ${what}`);
  try {
    return getAddress(value);
  } catch {
    throw new UsageError(`${what} is not an address: ${value}`);
  }
}

/** The exact command an agent runs to preview a contract call. It never runs `execute` on its own. */
export function bawPreview(chainId: number, from: Address, to: Address, data: string, valueWei = 0n): string {
  return [
    "baw contract-call preview",
    `--binanceChainId ${chainId}`,
    `--from ${from}`,
    `--to ${to}`,
    `--value ${valueWei.toString()}`,
    `--inputData ${data}`,
    "--json",
  ].join(" ");
}
