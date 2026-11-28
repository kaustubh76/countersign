import {
  getAddress,
  hexToBigInt,
  isAddressEqual,
  keccak256,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type Log,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import { FLAG_ANCHOR, FLAG_PULL, FLOW_APPROVE, FLOW_TRANSFER, HARMFUL_REDLINE_RULES, KIND_COUNTERSIGN, MANIFEST_FILE, RULESET_VERSION, SESSION_WINDOW_BLOCKS } from "./constants.js";
import { parseManifest } from "./manifest.js";
import { hashSkillFiles, type SkillFile } from "./skillHash.js";
import type { RecordView, VersionView } from "./views.js";

/**
 * Ruleset countersign.ruleset/v1: decides, from chain data alone, whether each countersign counts and
 * whether a version has a verified incident. Deterministic: the same chain state gives the same result.
 *
 * A countersign counts if:
 *   C2  every cited tx succeeded on this chain, was sent by the signer, was mined after the version was
 *       registered and at most 48 h before the countersign, called a declared function on a declared
 *       target with value within its cap, and the target's code has not changed;
 *   C3  at least one cited tx called an endorsed anchor (a contract the author provably owns);
 *   C4  every approval the signer granted in those txs matches a declared flow within its cap, and every
 *       direct token transfer goes to a declared recipient within its cap;
 *   C5  the signer is not the author or an endorser, has not also reported the version, and is not in a
 *       reciprocal "you countersign mine, I countersign yours" pair with the author ("peer" count).
 *   (C1, canonical content, is reported per version and does not gate individual records.)
 *
 * Verified incidents are things a competitor cannot manufacture with their own wallet:
 *   I1 drift        a declared target's code or EIP-1967 implementation changed after registration
 *   I2 author-pull  a tx *sent by the author* moved or approved the reporter's assets outside a declared
 *                   PULL flow
 *   I3 static       the published content fails the static Red-Line rules for confirmation bypass,
 *                   unlimited or undeclared transfers, or credential requests
 * Every other report is a claim: shown, never decisive, flagged when 3+ independent backed claims agree.
 *
 * This module is pure (it only needs a TxSource), so it also runs in a browser. Loading a registry
 * snapshot from chain and fetching published content live in snapshot.ts.
 */

export const TOPIC_TRANSFER: Hex = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const TOPIC_APPROVAL: Hex = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
export const TOPIC_APPROVAL_FOR_ALL: Hex = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";
export const EIP1967_IMPL_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const SEL_TRANSFER = "0xa9059cbb";
const SEL_TRANSFER_FROM = "0x23b872dd";
const EMPTY_SELECTOR = "0x00000000";

export interface TxSource {
  getTransaction(hash: Hash): Promise<Transaction | null>;
  getReceipt(hash: Hash): Promise<TransactionReceipt | null>;
  getCode(address: Address): Promise<Hex | undefined>;
  getStorageAt(address: Address, slot: Hex): Promise<Hex | undefined>;
}

/** Who countersigned whom, across the whole registry (for reciprocal-pair detection). */
export interface RegistryGraph {
  /** "signerAgentId>registrantAgentId" for every countersign record. */
  countersignedAuthors: Set<string>;
}

export type RecordStatus = "counted" | "peer" | "rejected";

export interface RecordVerdict {
  status: RecordStatus;
  /** Short codes, e.g. "undeclared-target"; aggregated without identities in public output. */
  reasons: string[];
}

export type IncidentKind = "drift" | "author-pull" | "static";

export interface Incident {
  kind: IncidentKind;
  detail: string;
  txHash?: Hex;
  target?: Address;
  rules?: string[];
}

export type CanonicalStatus = "verified" | "mismatch" | "unavailable" | "skipped";
export type VersionStatus = "incident" | "warning" | "unproven" | "ok";

export interface VersionReport {
  ruleset: string;
  versionId: Hex;
  computedAtBlock: bigint | null;
  canonical: CanonicalStatus;
  canonicalDetail: string[];
  anchors: { declared: number; endorsed: number };
  attestation: { rulesChecked: number; rulesPassed: number; revoked: boolean; reportHash: Hex; checkerCommit: Hex } | null;
  countersigns: { total: number; counted: number; peer: number; rejected: number; rejectionReasons: Record<string, number> };
  incidents: Incident[];
  claims: { total: number; backed: number; corroborated: boolean };
  status: VersionStatus;
}

/** Static check over content files (injected so core does not depend on the redline package). */
export type StaticCheck = (files: SkillFile[]) => { failedRules: string[] };

export interface VerifyInput {
  chainId: number;
  version: VersionView;
  countersigns: RecordView[];
  reports: RecordView[];
  graph: RegistryGraph;
  /** Files fetched from contentURI (null: unavailable; undefined: not attempted). */
  content?: SkillFile[] | null;
  contentError?: string;
  staticCheck?: StaticCheck;
  computedAtBlock?: bigint | null;
}

const lower = (a: string) => a.toLowerCase();
const topicAddress = (topic: Hex | undefined): Address | null =>
  topic && topic.length === 66 ? getAddress(`0x${topic.slice(26)}`) : null;

function selectorOf(input: Hex): string {
  return input.length >= 10 ? input.slice(0, 10).toLowerCase() : EMPTY_SELECTOR;
}

function authorSet(v: VersionView): Set<string> {
  const s = new Set<string>([lower(v.registrant)]);
  for (const t of v.targets) if (t.endorser !== zeroAddress) s.add(lower(t.endorser));
  return s;
}

/** C4 over one receipt: approvals and direct transfers by `signer` must match declared flows. */
function checkEffects(v: VersionView, tx: Transaction, receipt: TransactionReceipt, signer: Address): string[] {
  const reasons: string[] = [];
  const flows = v.flows;
  const selector = selectorOf(tx.input);
  const directTransfer = selector === SEL_TRANSFER || selector === SEL_TRANSFER_FROM;
  for (const log of receipt.logs as Log[]) {
    const t0 = log.topics[0];
    if (t0 === TOPIC_APPROVAL) {
      const owner = topicAddress(log.topics[1]);
      const spender = topicAddress(log.topics[2]);
      if (!owner || !spender || !isAddressEqual(owner, signer)) continue;
      const flow = flows.find((f) => f.kind === FLOW_APPROVE && isAddressEqual(f.token, log.address) && isAddressEqual(f.counterparty, spender));
      if (!flow) {
        reasons.push("approval-undeclared");
        continue;
      }
      // ERC-20 approvals carry the amount in data; ERC-721 approvals carry a tokenId topic and no data.
      if (log.topics.length === 3 && log.data && log.data !== "0x" && hexToBigInt(log.data) > flow.cap) reasons.push("approval-over-cap");
    } else if (t0 === TOPIC_APPROVAL_FOR_ALL) {
      const owner = topicAddress(log.topics[1]);
      const operator = topicAddress(log.topics[2]);
      const approved = log.data && log.data !== "0x" && hexToBigInt(log.data) !== 0n;
      if (!owner || !operator || !approved || !isAddressEqual(owner, signer)) continue;
      const declared = flows.some((f) => f.kind === FLOW_APPROVE && isAddressEqual(f.token, log.address) && isAddressEqual(f.counterparty, operator));
      if (!declared) reasons.push("operator-undeclared");
    } else if (t0 === TOPIC_TRANSFER && directTransfer && tx.to && isAddressEqual(log.address, tx.to)) {
      const from = topicAddress(log.topics[1]);
      const to = topicAddress(log.topics[2]);
      if (!from || !to || !isAddressEqual(from, signer)) continue;
      const flow = flows.find((f) => f.kind === FLOW_TRANSFER && isAddressEqual(f.token, log.address) && isAddressEqual(f.counterparty, to));
      if (!flow) reasons.push("transfer-undeclared-recipient");
      else if (log.topics.length === 3 && log.data && log.data !== "0x" && hexToBigInt(log.data) > flow.cap) reasons.push("transfer-over-cap");
    }
  }
  return reasons;
}

interface TxCheck {
  ok: boolean;
  reasons: string[];
  anchorHit: boolean;
}

async function checkCitedTx(
  input: VerifyInput,
  src: TxSource,
  codeChanged: (target: Address) => Promise<boolean>,
  record: RecordView,
  hash: Hex,
  opts: { requireInWindow: boolean },
): Promise<TxCheck> {
  const v = input.version;
  const [tx, receipt] = await Promise.all([src.getTransaction(hash), src.getReceipt(hash)]);
  if (!tx || !receipt || tx.blockNumber == null) return { ok: false, reasons: ["tx-not-found"], anchorHit: false };
  const reasons: string[] = [];
  if (receipt.status !== "success") reasons.push("tx-failed");
  if (tx.chainId !== undefined && Number(tx.chainId) !== input.chainId) reasons.push("wrong-chain");
  if (!isAddressEqual(tx.from, record.signer)) reasons.push("not-from-signer");
  if (tx.blockNumber <= v.registeredBlock) reasons.push("before-registration");
  if (tx.blockNumber > record.blockNumber) reasons.push("after-record");
  else if (opts.requireInWindow && record.blockNumber - tx.blockNumber > SESSION_WINDOW_BLOCKS) reasons.push("outside-window");

  const index = tx.to ? v.targets.findIndex((t) => isAddressEqual(t.target, tx.to as Address)) : -1;
  const target = index >= 0 ? v.targets[index] : undefined;
  if (!target) {
    reasons.push("undeclared-target");
    return { ok: false, reasons, anchorHit: false };
  }
  const selector = selectorOf(tx.input);
  if (!v.permissions.some((p) => p.targetIndex === index && lower(p.selector) === selector)) reasons.push("undeclared-function");
  if (tx.value > target.maxValue) reasons.push("value-over-cap");
  if (await codeChanged(target.target)) reasons.push("target-code-changed");
  reasons.push(...checkEffects(v, tx, receipt, record.signer));
  const anchorHit = (target.flags & FLAG_ANCHOR) !== 0 && target.endorser !== zeroAddress;
  return { ok: reasons.length === 0, reasons, anchorHit };
}

/** I2: does this evidence tx, sent by an author, move or approve the reporter's assets outside a PULL flow? */
async function authorPull(input: VerifyInput, src: TxSource, record: RecordView, hash: Hex): Promise<Incident | null> {
  const v = input.version;
  const [tx, receipt] = await Promise.all([src.getTransaction(hash), src.getReceipt(hash)]);
  if (!tx || !receipt || tx.blockNumber == null || receipt.status !== "success") return null;
  if (tx.blockNumber <= v.registeredBlock || tx.blockNumber > record.blockNumber) return null;
  if (!authorSet(v).has(lower(tx.from))) return null;
  const pullTarget = tx.to ? v.targets.find((t) => isAddressEqual(t.target, tx.to as Address) && (t.flags & FLAG_PULL) !== 0) : undefined;
  for (const log of receipt.logs as Log[]) {
    const t0 = log.topics[0];
    const party = topicAddress(log.topics[1]);
    if (!party || !isAddressEqual(party, record.signer)) continue;
    if (t0 === TOPIC_TRANSFER) {
      const allowed =
        pullTarget &&
        v.flows.some(
          (f) =>
            f.kind === FLOW_APPROVE &&
            isAddressEqual(f.token, log.address) &&
            isAddressEqual(f.counterparty, pullTarget.target) &&
            (log.topics.length !== 3 || !log.data || log.data === "0x" || hexToBigInt(log.data) <= f.cap),
        );
      if (!allowed) return { kind: "author-pull", detail: "a transaction sent by the author moved the reporter's tokens", txHash: hash };
    } else if (t0 === TOPIC_APPROVAL || t0 === TOPIC_APPROVAL_FOR_ALL) {
      return { kind: "author-pull", detail: "a transaction sent by the author created an approval over the reporter's tokens", txHash: hash };
    }
  }
  return null;
}

export async function verifyVersionData(input: VerifyInput, src: TxSource): Promise<VersionReport> {
  const v = input.version;
  const codeCache = new Map<string, Promise<boolean>>();
  const codeChanged = (target: Address): Promise<boolean> => {
    const key = lower(target);
    let p = codeCache.get(key);
    if (!p) {
      const stored = v.targets.find((t) => isAddressEqual(t.target, target))?.codehash;
      p = src.getCode(target).then((code) => (code === undefined ? false : keccak256(code === "0x" ? "0x" : code) !== stored));
      codeCache.set(key, p);
    }
    return p;
  };

  // ── C1: canonical content ────────────────────────────────────────────────────────────────────
  let canonical: CanonicalStatus = "skipped";
  const canonicalDetail: string[] = [];
  if (input.content === null) {
    canonical = "unavailable";
    canonicalDetail.push(input.contentError ?? "content could not be fetched from contentURI");
  } else if (input.content) {
    try {
      const { contentHash } = hashSkillFiles(input.content);
      const manifestFile = input.content.find((f) => f.path === MANIFEST_FILE);
      if (contentHash !== v.contentHash) canonicalDetail.push("content at contentURI does not hash to the registered contentHash");
      if (!manifestFile) canonicalDetail.push(`${MANIFEST_FILE} missing from the content`);
      else {
        const parsed = parseManifest(JSON.parse(new TextDecoder().decode(manifestFile.bytes)));
        if (!isAddressEqual(parsed.publisher, v.registrant)) canonicalDetail.push("registrant is not the publisher named in countersign.json (not the canonical version)");
        if (parsed.manifestHash !== v.manifestHash) canonicalDetail.push("countersign.json does not encode to the registered manifestHash");
      }
      canonical = canonicalDetail.length === 0 ? "verified" : "mismatch";
    } catch (e) {
      canonical = "mismatch";
      canonicalDetail.push(`content is not a valid skill: ${(e as Error).message}`);
    }
  }

  // ── I1: drift ────────────────────────────────────────────────────────────────────────────────
  const incidents: Incident[] = [];
  for (const t of v.targets) {
    if (await codeChanged(t.target)) incidents.push({ kind: "drift", detail: "target code changed since registration", target: t.target });
    if (t.impl !== zeroAddress) {
      const slot = await src.getStorageAt(t.target, EIP1967_IMPL_SLOT);
      const impl = slot && slot !== "0x" ? getAddress(`0x${slot.slice(-40)}`) : zeroAddress;
      if (!isAddressEqual(impl, t.impl)) incidents.push({ kind: "drift", detail: `proxy implementation is ${impl}, not the declared ${t.impl}`, target: t.target });
    }
  }

  // ── I3: static findings on the published content ─────────────────────────────────────────────
  if (input.content && input.staticCheck) {
    const { failedRules } = input.staticCheck(input.content);
    const harmful = failedRules.filter((r) => HARMFUL_REDLINE_RULES.includes(r));
    if (harmful.length) incidents.push({ kind: "static", detail: `published content fails ${harmful.join(", ")}`, rules: harmful });
  }

  // ── reports: I2 incidents, otherwise claims ──────────────────────────────────────────────────
  const reporterAgents = new Set(input.reports.map((r) => r.agentId.toString()));
  const authors = authorSet(v);
  const registrantKey = v.registrantAgentId.toString();
  const isPeer = (agentId: bigint) => input.graph.countersignedAuthors.has(`${registrantKey}>${agentId.toString()}`);
  let backed = 0;
  let authorPullReports = 0;
  const backedAgents = new Set<string>();
  for (const r of input.reports) {
    let incident: Incident | null = null;
    let hasValidSession = false;
    for (const hash of r.txHashes) {
      incident ??= await authorPull(input, src, r, hash);
      if (!hasValidSession) {
        const check = await checkCitedTx(input, src, codeChanged, r, hash, { requireInWindow: true });
        hasValidSession = check.reasons.every((x) => x.startsWith("approval") || x.startsWith("operator") || x.startsWith("transfer"));
      }
    }
    if (incident) {
      authorPullReports++;
      if (!incidents.some((i) => i.kind === incident.kind && i.txHash === incident.txHash)) incidents.push(incident);
    } else if (hasValidSession && !authors.has(lower(r.signer)) && !isPeer(r.agentId)) {
      backed++;
      backedAgents.add(r.agentId.toString());
    }
  }

  // ── countersigns: C2–C5 ──────────────────────────────────────────────────────────────────────
  let counted = 0;
  let peer = 0;
  let rejected = 0;
  const rejectionReasons: Record<string, number> = {};
  for (const r of input.countersigns) {
    const verdict = await evaluateCountersign(input, src, codeChanged, r, authors, reporterAgents, isPeer);
    if (verdict.status === "counted") counted++;
    else if (verdict.status === "peer") peer++;
    else {
      rejected++;
      for (const reason of new Set(verdict.reasons)) rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
    }
  }

  const declaredAnchors = v.targets.filter((t) => (t.flags & FLAG_ANCHOR) !== 0).length;
  const endorsedAnchors = v.targets.filter((t) => (t.flags & FLAG_ANCHOR) !== 0 && t.endorser !== zeroAddress).length;
  const corroborated = backedAgents.size >= 3;
  const status: VersionStatus =
    incidents.length > 0
      ? "incident"
      : canonical === "mismatch" || corroborated || endorsedAnchors === 0
        ? "warning"
        : counted === 0
          ? "unproven"
          : "ok";

  return {
    ruleset: RULESET_VERSION,
    versionId: v.versionId,
    computedAtBlock: input.computedAtBlock ?? null,
    canonical,
    canonicalDetail,
    anchors: { declared: declaredAnchors, endorsed: endorsedAnchors },
    attestation: v.attestation
      ? {
          rulesChecked: v.attestation.rulesChecked,
          rulesPassed: v.attestation.rulesPassed,
          revoked: v.attestation.revoked,
          reportHash: v.attestation.reportHash,
          checkerCommit: v.attestation.checkerCommit,
        }
      : null,
    countersigns: { total: input.countersigns.length, counted, peer, rejected, rejectionReasons },
    incidents,
    claims: { total: input.reports.length - authorPullReports, backed, corroborated },
    status,
  };
}

async function evaluateCountersign(
  input: VerifyInput,
  src: TxSource,
  codeChanged: (target: Address) => Promise<boolean>,
  r: RecordView,
  authors: Set<string>,
  reporterAgents: Set<string>,
  isPeer: (agentId: bigint) => boolean,
): Promise<RecordVerdict> {
  const reasons: string[] = [];
  if (r.kind !== KIND_COUNTERSIGN) return { status: "rejected", reasons: ["not-a-countersign"] };
  if (authors.has(lower(r.signer))) reasons.push("author-or-endorser");
  if (reporterAgents.has(r.agentId.toString())) reasons.push("also-reported");
  let anchorHit = false;
  for (const hash of r.txHashes) {
    const check = await checkCitedTx(input, src, codeChanged, r, hash, { requireInWindow: true });
    reasons.push(...check.reasons);
    anchorHit ||= check.ok && check.anchorHit;
  }
  if (!anchorHit) reasons.push("no-anchor-hit");
  if (reasons.length > 0) return { status: "rejected", reasons };
  return isPeer(r.agentId) ? { status: "peer", reasons: ["reciprocal-author-pair"] } : { status: "counted", reasons: [] };
}

/** Evaluate one record on its own (the companion uses this to tell a user whether their claim will count). */
export async function evaluateRecord(input: VerifyInput, src: TxSource, record: RecordView): Promise<RecordVerdict> {
  const v = input.version;
  const cache = new Map<string, Promise<boolean>>();
  const codeChanged = (target: Address) => {
    let p = cache.get(lower(target));
    if (!p) {
      const stored = v.targets.find((t) => isAddressEqual(t.target, target))?.codehash;
      p = src.getCode(target).then((code) => (code === undefined ? false : keccak256(code) !== stored));
      cache.set(lower(target), p);
    }
    return p;
  };
  const registrantKey = v.registrantAgentId.toString();
  return evaluateCountersign(
    input,
    src,
    codeChanged,
    record,
    authorSet(v),
    new Set(input.reports.map((r) => r.agentId.toString())),
    (agentId) => input.graph.countersignedAuthors.has(`${registrantKey}>${agentId.toString()}`),
  );
}
