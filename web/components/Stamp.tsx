import type { ReactNode } from "react";
import type { Outcome } from "@/lib/sim/scenarios";

export type StampKind = "ok" | "bad" | "warn" | "seal" | "idle";

/** A rubber-stamp label: bordered caps, slightly rotated, in stamp ink. */
export function Stamp({ kind = "idle", big, children, className }: { kind?: StampKind; big?: boolean; children: ReactNode; className?: string }) {
  return <span className={`stamp ${kind}${big ? " big" : ""}${className ? ` ${className}` : ""}`}>{children}</span>;
}

export const OUTCOME_STAMP: Record<Outcome, { label: string; kind: StampKind }> = {
  reverted: { label: "Refused", kind: "bad" },
  rejected: { label: "Void", kind: "bad" },
  peer: { label: "Peer only", kind: "warn" },
  claim: { label: "Claim", kind: "warn" },
  warning: { label: "Flagged", kind: "warn" },
  counted: { label: "Counted", kind: "ok" },
  incident: { label: "Incident", kind: "bad" },
};
