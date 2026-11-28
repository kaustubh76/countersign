import type { Address, Hex } from "viem";
import { KIND_COUNTERSIGN, KIND_REPORT } from "./constants.js";
import { fetchGithubSkill } from "./content.js";
import type { Deployment } from "./deployments.js";
import type { ChainReader } from "./rpc.js";
import type { SkillFile } from "./skillHash.js";
import { verifyAllVersions, verifyVersionData, type RegistryGraph, type StaticCheck, type TxSource, type VerifyInput, type VersionReport } from "./verifier.js";
import { readRecords, readVersion, readVersionIds, type RecordView, type VersionView } from "./views.js";

/** Loading a registry snapshot from chain (views only) and verifying a version against it. */

export interface RegistrySnapshot {
  versions: Map<Hex, VersionView>;
  countersigns: Map<Hex, RecordView[]>;
  reports: Map<Hex, RecordView[]>;
  graph: RegistryGraph;
  block: bigint;
  /** The deployment's GuardedExecutor, if it has one. */
  guardedExecutor?: Address;
}

/** Read every version and record (views only; no eth_getLogs). Fine at hackathon scale. */
export async function loadSnapshot(reader: ChainReader, d: Deployment): Promise<RegistrySnapshot> {
  const block = await reader.getBlockNumber();
  const ids = await readVersionIds(reader, d);
  const versions = new Map<Hex, VersionView>();
  const countersigns = new Map<Hex, RecordView[]>();
  const reports = new Map<Hex, RecordView[]>();
  for (const id of ids) {
    const v = await readVersion(reader, d, id);
    if (!v) continue;
    versions.set(id, v);
    countersigns.set(id, await readRecords(reader, d, id, KIND_COUNTERSIGN));
    reports.set(id, await readRecords(reader, d, id, KIND_REPORT));
  }
  const graph: RegistryGraph = { countersignedAuthors: new Set() };
  for (const [id, records] of countersigns) {
    const registrant = versions.get(id)?.registrantAgentId;
    if (registrant === undefined) continue;
    for (const r of records) graph.countersignedAuthors.add(`${r.agentId.toString()}>${registrant.toString()}`);
  }
  return { versions, countersigns, reports, graph, block, ...(d.guardedExecutor ? { guardedExecutor: d.guardedExecutor } : {}) };
}

export interface VerifyOptions {
  staticCheck?: StaticCheck;
  /** Fetch content for C1/I3 (default: GitHub tree URLs). Pass false to skip. */
  fetchContent?: ((uri: string) => Promise<SkillFile[]>) | false;
}

async function inputFor(snap: RegistrySnapshot, chainId: number, version: VersionView, opts: VerifyOptions, withContent: boolean): Promise<VerifyInput> {
  let content: SkillFile[] | null | undefined;
  let contentError: string | undefined;
  if (withContent && opts.fetchContent !== false) {
    try {
      content = await (opts.fetchContent ?? ((uri: string) => fetchGithubSkill(uri)))(version.contentURI);
    } catch (e) {
      content = null;
      contentError = (e as Error).message;
    }
  }
  return {
    chainId,
    version,
    countersigns: snap.countersigns.get(version.versionId) ?? [],
    reports: snap.reports.get(version.versionId) ?? [],
    graph: snap.graph,
    content,
    contentError,
    staticCheck: opts.staticCheck,
    computedAtBlock: snap.block,
    ...(snap.guardedExecutor ? { guardedExecutor: snap.guardedExecutor } : {}),
  };
}

/** One version on its own (W1 "established" is left null: it needs the whole registry). */
export async function verifyFromSnapshot(
  snap: RegistrySnapshot,
  chainId: number,
  versionId: Hex,
  src: TxSource,
  opts: VerifyOptions = {},
): Promise<VersionReport | null> {
  const version = snap.versions.get(versionId);
  if (!version) return null;
  return verifyVersionData(await inputFor(snap, chainId, version, opts, true), src);
}

/**
 * Every version in the registry, with W1 filled in. Content (C1, I3) is fetched for every version, or only
 * for `contentFor` when given (the companion verifying one skill does not need every other tarball).
 */
export async function verifySnapshot(
  snap: RegistrySnapshot,
  chainId: number,
  src: TxSource,
  opts: VerifyOptions & { contentFor?: Hex } = {},
): Promise<Map<Hex, VersionReport>> {
  const inputs: VerifyInput[] = [];
  for (const version of snap.versions.values()) {
    const withContent = opts.contentFor === undefined || opts.contentFor.toLowerCase() === version.versionId.toLowerCase();
    inputs.push(await inputFor(snap, chainId, version, opts, withContent));
  }
  return verifyAllVersions(inputs, src);
}
