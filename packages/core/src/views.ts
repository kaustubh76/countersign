import { keccak256, toBytes, type Address, type Hex } from "viem";
import { agentIdAbi, countersignAbi, skillRegistryAbi } from "./abi.js";
import { KIND_COUNTERSIGN, LIMITS } from "./constants.js";
import type { Deployment } from "./deployments.js";
import type { Flow, Permission } from "./manifest.js";
import type { ChainReader } from "./rpc.js";

export interface OnchainTarget {
  target: Address;
  maxValue: bigint;
  impl: Address;
  flags: number;
  endorser: Address;
  codehash: Hex;
}

export interface AttestationView {
  attester: Address;
  blockNumber: bigint;
  rulesChecked: number;
  rulesPassed: number;
  checkerCommit: Hex;
  revoked: boolean;
  reportHash: Hex;
}

export interface VersionView {
  versionId: Hex;
  contentHash: Hex;
  manifestHash: Hex;
  registrantAgentId: bigint;
  registrant: Address;
  registeredBlock: bigint;
  registeredAt: bigint;
  contentURI: string;
  targets: OnchainTarget[];
  permissions: Permission[];
  flows: Flow[];
  attestation: AttestationView | null;
}

export interface RecordView {
  versionId: Hex;
  agentId: bigint;
  signer: Address;
  blockNumber: bigint;
  kind: number;
  txHashes: Hex[];
}

export async function readVersion(reader: ChainReader, d: Deployment, versionId: Hex): Promise<VersionView | null> {
  const c = reader.client;
  const v = await c.readContract({ address: d.skillRegistry, abi: skillRegistryAbi, functionName: "getVersion", args: [versionId] });
  if (v.registeredBlock === 0n) return null;
  const [targets, permissions, flows] = await c.readContract({
    address: d.skillRegistry,
    abi: skillRegistryAbi,
    functionName: "getManifest",
    args: [versionId],
  });
  const a = await c.readContract({ address: d.skillRegistry, abi: skillRegistryAbi, functionName: "getAttestation", args: [versionId] });
  return {
    versionId,
    contentHash: v.contentHash,
    manifestHash: v.manifestHash,
    registrantAgentId: v.registrantAgentId,
    registrant: v.registrant,
    registeredBlock: v.registeredBlock,
    registeredAt: v.registeredAt,
    contentURI: v.contentURI,
    targets: targets.map((t) => ({ ...t })),
    permissions: permissions.map((p) => ({ targetIndex: p.targetIndex, selector: p.selector })),
    flows: flows.map((f) => ({ token: f.token, counterparty: f.counterparty, kind: f.kind, cap: f.cap })),
    attestation: a.blockNumber === 0n ? null : { ...a },
  };
}

export async function readVersionIds(reader: ChainReader, d: Deployment): Promise<Hex[]> {
  const c = reader.client;
  const count = await c.readContract({ address: d.skillRegistry, abi: skillRegistryAbi, functionName: "versionCount" });
  const ids: Hex[] = [];
  for (let offset = 0n; offset < count; offset += BigInt(LIMITS.page)) {
    const page = await c.readContract({
      address: d.skillRegistry,
      abi: skillRegistryAbi,
      functionName: "versionsPage",
      args: [offset, BigInt(LIMITS.page)],
    });
    ids.push(...page);
  }
  return ids;
}

export async function readVersionsByContent(reader: ChainReader, d: Deployment, contentHash: Hex): Promise<Hex[]> {
  const ids: Hex[] = [];
  let total = 1n;
  for (let offset = 0n; offset < total; offset += BigInt(LIMITS.page)) {
    const [page, t] = await reader.client.readContract({
      address: d.skillRegistry,
      abi: skillRegistryAbi,
      functionName: "versionsByContent",
      args: [contentHash, offset, BigInt(LIMITS.page)],
    });
    total = t;
    ids.push(...page);
  }
  return ids;
}

/** Every countersign (kind 1) or report (kind 2) record for a version. */
export async function readRecords(
  reader: ChainReader,
  d: Deployment,
  versionId: Hex,
  kind: number = KIND_COUNTERSIGN,
): Promise<RecordView[]> {
  const fn = kind === KIND_COUNTERSIGN ? "countersignsOf" : "reportsOf";
  const out: RecordView[] = [];
  let total = 1n;
  for (let offset = 0n; offset < total; offset += BigInt(LIMITS.page)) {
    const [page, t] = await reader.client.readContract({
      address: d.countersign,
      abi: countersignAbi,
      functionName: fn,
      args: [versionId, offset, BigInt(LIMITS.page)],
    });
    total = t;
    for (const r of page) out.push({ ...r, txHashes: [...r.txHashes] });
  }
  return out;
}

export interface AgentIdentity {
  handle: string;
  agentId: bigint;
}

/** The Agent ID held by `account`, or null. Used only for the caller's own wallet, never for lookups of others. */
export async function readAgentId(reader: ChainReader, agentIdAddress: Address, account: Address): Promise<AgentIdentity | null> {
  const handle = await reader.client.readContract({ address: agentIdAddress, abi: agentIdAbi, functionName: "handleOf", args: [account] });
  if (!handle) return null;
  return { handle, agentId: BigInt(keccak256(toBytes(handle))) };
}

export async function readUniqueAgents(reader: ChainReader, d: Deployment): Promise<{ registry: bigint; countersign: bigint }> {
  const [registry, countersign] = await Promise.all([
    reader.client.readContract({ address: d.skillRegistry, abi: skillRegistryAbi, functionName: "uniqueAgents" }),
    reader.client.readContract({ address: d.countersign, abi: countersignAbi, functionName: "uniqueAgents" }),
  ]);
  return { registry, countersign };
}
