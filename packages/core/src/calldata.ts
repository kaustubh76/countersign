import { encodeFunctionData, type Hex } from "viem";
import { countersignAbi, skillRegistryAbi } from "./abi.js";
import { LIMITS } from "./constants.js";
import type { OnchainManifest } from "./manifest.js";

/** Calldata builders, so an agent never hand-encodes ABI before `baw contract-call preview --inputData`. */

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function checkTxHashes(hashes: readonly string[]): Hex[] {
  if (hashes.length < 1 || hashes.length > LIMITS.txHashes) {
    throw new Error(`cite between 1 and ${LIMITS.txHashes} transactions (got ${hashes.length})`);
  }
  const out: Hex[] = [];
  const seen = new Set<string>();
  for (const h of hashes) {
    if (!TX_HASH_RE.test(h)) throw new Error(`not a transaction hash: ${h}`);
    const lower = h.toLowerCase();
    if (/^0x0{64}$/.test(lower)) throw new Error("zero transaction hash");
    if (seen.has(lower)) throw new Error(`duplicate transaction hash: ${h}`);
    seen.add(lower);
    out.push(lower as Hex);
  }
  return out;
}

export function encodeRegister(contentHash: Hex, contentURI: string, manifest: OnchainManifest): Hex {
  const uriBytes = new TextEncoder().encode(contentURI).length;
  if (uriBytes === 0 || uriBytes > LIMITS.uriBytes) throw new Error(`contentURI must be 1–${LIMITS.uriBytes} bytes`);
  return encodeFunctionData({
    abi: skillRegistryAbi,
    functionName: "register",
    args: [contentHash, contentURI, manifest.targets, manifest.permissions, manifest.flows],
  });
}

export function encodeEndorseAnchor(versionId: Hex, targetIndex: number): Hex {
  return encodeFunctionData({ abi: skillRegistryAbi, functionName: "endorseAnchor", args: [versionId, targetIndex] });
}

export function encodeAttest(
  versionId: Hex,
  rulesChecked: number,
  rulesPassed: number,
  checkerCommit: Hex,
  reportHash: Hex,
): Hex {
  return encodeFunctionData({
    abi: skillRegistryAbi,
    functionName: "attest",
    args: [versionId, rulesChecked, rulesPassed, checkerCommit, reportHash],
  });
}

export function encodeCountersign(versionId: Hex, sessionTxs: readonly string[]): Hex {
  return encodeFunctionData({ abi: countersignAbi, functionName: "countersign", args: [versionId, checkTxHashes(sessionTxs)] });
}

export function encodeReport(versionId: Hex, evidenceTxs: readonly string[]): Hex {
  return encodeFunctionData({ abi: countersignAbi, functionName: "report", args: [versionId, checkTxHashes(evidenceTxs)] });
}
