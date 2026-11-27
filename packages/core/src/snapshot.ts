import type { Hex } from "viem";
import { KIND_COUNTERSIGN, KIND_REPORT } from "./constants.js";
import { fetchGithubSkill } from "./content.js";
import type { Deployment } from "./deployments.js";
import type { ChainReader } from "./rpc.js";
import type { SkillFile } from "./skillHash.js";
import { verifyVersionData, type RegistryGraph, type StaticCheck, type TxSource, type VersionReport } from "./verifier.js";
import { readRecords, readVersion, readVersionIds, type RecordView, type VersionView } from "./views.js";

/** Loading a registry snapshot from chain (views only) and verifying a version against it. */

export interface RegistrySnapshot {
  versions: Map<Hex, VersionView>;
  countersigns: Map<Hex, RecordView[]>;
  reports: Map<Hex, RecordView[]>;
  graph: RegistryGraph;
  block: bigint;
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
  return { versions, countersigns, reports, graph, block };
}

export interface VerifyOptions {
  staticCheck?: StaticCheck;
  /** Fetch content for C1/I3 (default: GitHub tree URLs). Pass false to skip. */
  fetchContent?: ((uri: string) => Promise<SkillFile[]>) | false;
}

export async function verifyFromSnapshot(
  snap: RegistrySnapshot,
  chainId: number,
  versionId: Hex,
  src: TxSource,
  opts: VerifyOptions = {},
): Promise<VersionReport | null> {
  const version = snap.versions.get(versionId);
  if (!version) return null;
  let content: SkillFile[] | null | undefined;
  let contentError: string | undefined;
  if (opts.fetchContent !== false) {
    try {
      content = await (opts.fetchContent ?? ((uri: string) => fetchGithubSkill(uri)))(version.contentURI);
    } catch (e) {
      content = null;
      contentError = (e as Error).message;
    }
  }
  return verifyVersionData(
    {
      chainId,
      version,
      countersigns: snap.countersigns.get(versionId) ?? [],
      reports: snap.reports.get(versionId) ?? [],
      graph: snap.graph,
      content,
      contentError,
      staticCheck: opts.staticCheck,
      computedAtBlock: snap.block,
    },
    src,
  );
}
