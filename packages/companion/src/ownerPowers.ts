import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getAddress, isAddress, type Address } from "viem";
import { createReader, rpcUrlsFromEnv, type ChainReader } from "@countersign/core";
import { checkSkill, contractCandidates, reportHash } from "@countersign/redline";
import { analyzeContracts, type LocalSource } from "@countersign/redline/sources";
import { bool, flag, list, type Args } from "./args.js";
import { UsageError } from "./context.js";
import type { LoadedSkill } from "./skill.js";

const OWNER_ABI = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const LOCAL_CHAINS = new Set([31337, 1337]);

/** --contracts a,b: the author's own contracts, given alongside the skill ("skill repo + contracts"). */
export function explicitContracts(args: Args): Address[] {
  return list(args, "contracts").map((a) => {
    if (!isAddress(a, { strict: false })) throw new UsageError(`--contracts: not an address: ${a}`);
    return getAddress(a.toLowerCase() as Address);
  });
}

/** --source <addr>=<file.sol>[:Contract],… : source for contracts on a local chain, where no verifier exists. */
async function localSources(args: Args, chainId: number): Promise<Record<string, LocalSource> | undefined> {
  const specs = list(args, "source");
  if (!specs.length) return undefined;
  if (!LOCAL_CHAINS.has(chainId)) {
    throw new UsageError("--source is only for local chains (anvil). On BNB Smart Chain, RL4 reads the verified source from Sourcify or BscScan.");
  }
  const out: Record<string, LocalSource> = {};
  for (const spec of specs) {
    const m = /^(0x[0-9a-fA-F]{40})=(.+?)(?::([A-Za-z_$][\w$]*))?$/.exec(spec);
    if (!m) throw new UsageError(`--source: expected <address>=<file.sol>[:Contract], got ${spec}`);
    out[m[1]!.toLowerCase()] = { files: { [basename(m[2]!)]: await readFile(m[2]!, "utf8") }, ...(m[3] ? { contractName: m[3] } : {}) };
  }
  return out;
}

/**
 * The Red-Line Check again, now with RL4: every contract the skill uses is looked up (verified source,
 * proxies, owner()) and its owner powers are checked against the skill's text. `--offline` skips it.
 */
export async function withOwnerPowers(
  skill: LoadedSkill,
  args: Args,
  opts: { reader?: ChainReader; chainId?: number; extraKnown?: readonly string[]; checkerCommit?: string | null } = {},
): Promise<LoadedSkill> {
  if (bool(args, "offline")) return skill;
  const chainId = opts.chainId ?? Number(flag(args, "chain") ?? skill.manifest?.chainId ?? 56);
  const explicit = explicitContracts(args);
  const local = await localSources(args, chainId);
  const rpc = flag(args, "rpc");
  const reader = opts.reader ?? createReader({ chainId, rpcUrls: rpc ? rpc.split(",") : rpcUrlsFromEnv() });
  const addresses = contractCandidates(skill.files, skill.manifest, explicit);
  const contracts = await analyzeContracts(addresses, {
    chainId,
    getCode: (a) => reader.getCode(a),
    getStorageAt: (a, slot) => reader.getStorageAt(a, slot),
    readOwner: async (a) => {
      try {
        return await reader.client.readContract({ address: a, abi: OWNER_ABI, functionName: "owner" });
      } catch {
        return null;
      }
    },
    ...(process.env.ETHERSCAN_API_KEY ? { etherscanKey: process.env.ETHERSCAN_API_KEY } : {}),
    ...(local ? { localSources: local } : {}),
  });
  const redline = checkSkill(skill.files, {
    extraKnown: opts.extraKnown,
    checkerCommit: opts.checkerCommit ?? skill.redline.checkerCommit,
    contracts,
    projectContracts: explicit,
  });
  return { ...skill, redline, redlineHash: reportHash(redline) };
}
