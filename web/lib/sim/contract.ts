import type { Hex } from "viem";
import type { VersionView } from "@countersign/core/browser";
import type { Actor } from "./world";

/**
 * A TypeScript mirror of the checks Countersign.sol makes in countersign(), in the same order, so the
 * playground can show what the contract itself refuses (before the verifier ever runs). The error names
 * are the contract's custom errors; web/test/scenarios.test.ts checks that each exists in the ABI.
 */

export type RevertName =
  | "UnknownVersion"
  | "NotAgentIdHolder"
  | "SelfCountersign"
  | "AlreadyCountersigned"
  | "BadTxCount"
  | "ZeroTxHash"
  | "DuplicateTxHash"
  | "TxAlreadyUsed";

export interface Revert {
  error: RevertName;
  /** Plain-English reason. */
  why: string;
}

export const REVERT_WHY: Record<RevertName, string> = {
  UnknownVersion: "that skill version was never registered",
  NotAgentIdHolder: "handleOf(sender) is empty: this wallet holds no Agent ID, so it cannot countersign anything",
  SelfCountersign: "the author's own wallet (or Agent ID) cannot countersign the author's skill",
  AlreadyCountersigned: "this Agent ID already countersigned this version; it gets one countersign per version",
  BadTxCount: "a countersign must cite between 1 and 8 session transactions",
  ZeroTxHash: "a cited transaction hash is empty",
  DuplicateTxHash: "the same transaction is cited twice",
  TxAlreadyUsed: "this Agent ID already cited that transaction in an earlier countersign; each one counts once",
};

const ZERO = `0x${"0".repeat(64)}`;

export class SimCountersign {
  private readonly countersigned = new Set<string>();
  private readonly consumed = new Set<string>();

  /** Returns the revert, or null if the call succeeds (and records it). */
  countersign(version: VersionView | null, sender: Actor, txHashes: Hex[]): Revert | null {
    const fail = (error: RevertName): Revert => ({ error, why: REVERT_WHY[error] });
    if (!version) return fail("UnknownVersion");
    if (sender.agentId === null) return fail("NotAgentIdHolder");
    const agentId = sender.agentId;
    if (sender.address.toLowerCase() === version.registrant.toLowerCase() || agentId === version.registrantAgentId) return fail("SelfCountersign");
    if (this.countersigned.has(`${version.versionId}:${agentId}`)) return fail("AlreadyCountersigned");
    if (txHashes.length === 0 || txHashes.length > 8) return fail("BadTxCount");
    const seen = new Set<string>();
    for (const h of txHashes) {
      if (h.toLowerCase() === ZERO) return fail("ZeroTxHash");
      if (seen.has(h.toLowerCase())) return fail("DuplicateTxHash");
      seen.add(h.toLowerCase());
    }
    for (const h of txHashes) if (this.consumed.has(`${agentId}:${h.toLowerCase()}`)) return fail("TxAlreadyUsed");
    for (const h of txHashes) this.consumed.add(`${agentId}:${h.toLowerCase()}`);
    this.countersigned.add(`${version.versionId}:${agentId}`);
    return null;
  }
}
