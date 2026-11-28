import { unstable_cache } from "next/cache";
import type { Address, Hash, Hex, Transaction, TransactionReceipt } from "viem";
import {
  BSC_CHAIN_ID,
  createReader,
  DEPLOYMENTS,
  loadSnapshot,
  parseDeploymentJson,
  readUniqueAgents,
  rpcUrlsFromEnv,
  verifySnapshot,
  type CanonicalStatus,
  type ChainReader,
  type Deployment,
  type SkillFile,
  type TxSource,
  type VersionReport,
  type VersionStatus,
} from "@countersign/core";
import { checkSkill } from "@countersign/redline";

/** Server-only data layer. Everything public is aggregate counts; no wallets, no handles. */

export function chainId(): number {
  return Number(process.env.COUNTERSIGN_CHAIN_ID ?? BSC_CHAIN_ID);
}

export function deployment(): Deployment | null {
  const json = process.env.COUNTERSIGN_DEPLOYMENT_JSON;
  if (json) return parseDeploymentJson(JSON.parse(json));
  return DEPLOYMENTS[chainId()] ?? null;
}

let readerSingleton: ChainReader | null = null;
export function reader(): ChainReader {
  readerSingleton ??= createReader({ chainId: chainId(), rpcUrls: rpcUrlsFromEnv() });
  return readerSingleton;
}

// ── immutable tx/receipt cache (shared across invocations via the Next.js data cache) ─────────

type SerTx = { hash: Hex; from: Address; to: Address | null; input: Hex; value: string; blockNumber: string | null; chainId?: number };
type SerReceipt = { status: "success" | "reverted"; logs: { address: Address; topics: Hex[]; data: Hex }[] };

const cachedTx = (hash: string) =>
  unstable_cache(
    async (): Promise<SerTx> => {
      const tx = await reader().getTransaction(hash as Hash);
      if (!tx || tx.blockNumber == null) throw new Error("not mined"); // errors are not cached
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to ?? null,
        input: tx.input,
        value: tx.value.toString(),
        blockNumber: tx.blockNumber.toString(),
        chainId: tx.chainId === undefined ? undefined : Number(tx.chainId),
      };
    },
    ["countersign-tx-v1", hash.toLowerCase()],
    { revalidate: false },
  )();

const cachedReceipt = (hash: string) =>
  unstable_cache(
    async (): Promise<SerReceipt> => {
      const r = await reader().getReceipt(hash as Hash);
      if (!r) throw new Error("no receipt");
      return { status: r.status, logs: r.logs.map((l) => ({ address: l.address, topics: [...l.topics] as Hex[], data: l.data })) };
    },
    ["countersign-receipt-v1", hash.toLowerCase()],
    { revalidate: false },
  )();

function cachedSource(): TxSource {
  return {
    async getTransaction(hash) {
      try {
        const t = await cachedTx(hash);
        return { ...t, value: BigInt(t.value), blockNumber: t.blockNumber == null ? null : BigInt(t.blockNumber) } as unknown as Transaction;
      } catch {
        return null;
      }
    },
    async getReceipt(hash) {
      try {
        return (await cachedReceipt(hash)) as unknown as TransactionReceipt;
      } catch {
        return null;
      }
    },
    getCode: (a) => reader().getCode(a),
    getStorageAt: (a, s) => reader().getStorageAt(a, s),
  };
}

function staticCheck(files: SkillFile[]): { failedRules: string[] } {
  return { failedRules: checkSkill(files).results.filter((r) => !r.passed).map((r) => r.rule) };
}

// ── index ──────────────────────────────────────────────────────────────────────────────────────

export interface PublicReport extends Omit<VersionReport, "computedAtBlock"> {
  computedAtBlock: string | null;
}

export interface VersionSummary {
  versionId: Hex;
  name: string;
  contentURI: string;
  registeredBlock: string;
  registeredAt: string;
  status: VersionStatus;
  canonical: CanonicalStatus;
  counted: number;
  /** W1: counted countersigners who also countersigned another author's skill. */
  established: number;
  peer: number;
  incidents: number;
  claims: number;
  attestation: "passed" | "failed" | "none";
  /** Active, passing Red-Line attestations (by distinct attesters). */
  attestedBy: number;
  report: PublicReport;
}

export interface IndexData {
  chainId: number;
  deployed: boolean;
  contracts: { skillRegistry: Address; countersign: Address; agentId: Address; guardedExecutor?: Address } | null;
  computedAt: string;
  computedAtBlock: string | null;
  /** union: distinct Agent IDs that registered, countersigned or reported (the eligibility metric). */
  uniqueAgents: { registry: number; countersign: number; union: number };
  totals: { versions: number; counted: number; incidents: number; attested: number };
  versions: VersionSummary[];
  error?: string;
}

function nameFromUri(uri: string): string {
  const parts = uri.replace(/\/+$/, "").split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? uri).slice(0, 64);
}

async function buildIndex(): Promise<IndexData> {
  const d = deployment();
  const base: IndexData = {
    chainId: chainId(),
    deployed: Boolean(d),
    contracts: d ? { skillRegistry: d.skillRegistry, countersign: d.countersign, agentId: d.agentId, ...(d.guardedExecutor ? { guardedExecutor: d.guardedExecutor } : {}) } : null,
    computedAt: new Date().toISOString(),
    computedAtBlock: null,
    uniqueAgents: { registry: 0, countersign: 0, union: 0 },
    totals: { versions: 0, counted: 0, incidents: 0, attested: 0 },
    versions: [],
  };
  if (!d) return base;
  try {
    const r = reader();
    const snap = await loadSnapshot(r, d);
    const src = cachedSource();
    const reports = await verifySnapshot(snap, base.chainId, src, { staticCheck });
    const versions: VersionSummary[] = [];
    for (const [versionId, v] of snap.versions) {
      const report = reports.get(versionId);
      if (!report) continue;
      versions.push({
        versionId,
        name: nameFromUri(v.contentURI),
        contentURI: v.contentURI,
        registeredBlock: v.registeredBlock.toString(),
        registeredAt: new Date(Number(v.registeredAt) * 1000).toISOString(),
        status: report.status,
        canonical: report.canonical,
        counted: report.countersigns.counted,
        established: report.countersigns.established ?? 0,
        peer: report.countersigns.peer,
        incidents: report.incidents.length,
        claims: report.claims.total,
        attestation: report.attestation.status,
        attestedBy: report.attestation.passing,
        report: { ...report, computedAtBlock: report.computedAtBlock?.toString() ?? null },
      });
    }
    // Incidents dominate (§7.3): a version with any verified incident never ranks above a clean one.
    const rank = (v: VersionSummary) => (v.incidents > 0 ? 3 : v.status === "warning" ? 2 : v.status === "unproven" ? 1 : 0);
    versions.sort((x, y) => rank(x) - rank(y) || y.counted - x.counted || Number(BigInt(y.registeredBlock) - BigInt(x.registeredBlock)));
    const ua = await readUniqueAgents(r, d);
    // Distinct Agent IDs that registered, countersigned or reported, from the views (no handle lookups).
    const agents = new Set<string>();
    for (const v of snap.versions.values()) agents.add(v.registrantAgentId.toString());
    for (const list of [...snap.countersigns.values(), ...snap.reports.values()]) for (const rec of list) agents.add(rec.agentId.toString());
    return {
      ...base,
      computedAtBlock: snap.block.toString(),
      uniqueAgents: { registry: Number(ua.registry), countersign: Number(ua.countersign), union: agents.size },
      totals: {
        versions: versions.length,
        counted: versions.reduce((n, v) => n + v.counted, 0),
        incidents: versions.reduce((n, v) => n + v.incidents, 0),
        attested: versions.filter((v) => v.attestation === "passed").length,
      },
      versions,
    };
  } catch (e) {
    return { ...base, error: (e as Error).message.split("\n")[0] };
  }
}

/** The full index, recomputed at most once a minute and served stale while it refreshes. */
export const getIndex = unstable_cache(buildIndex, ["countersign-index-v2"], { revalidate: 60, tags: ["index"] });

export async function getVersionSummary(versionId: string): Promise<VersionSummary | null> {
  const index = await getIndex();
  return index.versions.find((v) => v.versionId.toLowerCase() === versionId.toLowerCase()) ?? null;
}
