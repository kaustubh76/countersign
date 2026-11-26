/** Plain-English labels for verifier reason codes (aggregated, never tied to a person). */
export const REASON_LABELS: Record<string, string> = {
  "tx-not-found": "a cited transaction was not found on chain",
  "tx-failed": "a cited transaction reverted",
  "wrong-chain": "a cited transaction is on another chain",
  "not-from-signer": "a cited transaction was not sent by the countersigner",
  "before-registration": "a cited transaction predates the version",
  "after-record": "a cited transaction is newer than the countersign",
  "outside-window": "the session was more than 48 h before the countersign",
  "undeclared-target": "a call went to a contract the manifest does not declare",
  "undeclared-function": "a call used a function the manifest does not declare",
  "value-over-cap": "a call sent more native value than declared",
  "target-code-changed": "a declared contract's code changed",
  "approval-undeclared": "an approval went to an undeclared spender",
  "approval-over-cap": "an approval exceeded its declared cap",
  "operator-undeclared": "an operator approval went to an undeclared address",
  "transfer-undeclared-recipient": "a token transfer went to an undeclared recipient",
  "transfer-over-cap": "a token transfer exceeded its declared cap",
  "no-anchor-hit": "no cited transaction touched the author's own contract",
  "author-or-endorser": "the countersigner is the author or an endorser",
  "also-reported": "the countersigner also reported this version",
};

export const STATUS_LABELS: Record<string, string> = {
  ok: "verified usage",
  unproven: "no verified usage yet",
  warning: "warning",
  incident: "verified incident",
};

export const INCIDENT_LABELS: Record<string, string> = {
  drift: "Contract drift",
  "author-pull": "Author-sent pull",
  static: "Static red-line finding",
};

export function shortHash(h: string): string {
  return h.length > 14 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}
