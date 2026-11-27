import { short } from "../site";
import type { Outcome, ScenarioResult, TraceStep } from "./scenarios";
import { ago, labelOf } from "./world";

/** The step that decides a scenario: its first failure, else its first warning. Null when nothing failed. */
export function decisiveStep(r: ScenarioResult): TraceStep | null {
  return r.steps.find((s) => s.state === "fail") ?? r.steps.find((s) => s.state === "warn") ?? null;
}

/** One line for the decisive step, e.g. "C3 · no anchor hit" or "NotAgentIdHolder(): this wallet holds no Agent ID". */
export function decisiveLine(r: ScenarioResult): string | null {
  const s = decisiveStep(r);
  if (!s) return null;
  const detail = s.detail[0] ?? "";
  if (s.id === "contract") return detail;
  return detail ? `${s.id} · ${detail}` : s.title;
}

/** The transactions an attempt cites, as display strings. */
export function txLines(r: ScenarioResult): { what: string; when: string }[] {
  return r.txs.map(({ tx }) => ({ what: tx.effects.join(", ") || labelOf(tx.to), when: ago(tx.block) }));
}

/** C1–C5 as pass/fail flags (skipped checks count as not passed). */
export function checkFlags(r: ScenarioResult): { id: string; ok: boolean }[] {
  return r.steps.filter((st) => /^C[1-5]$/.test(st.id)).map((st) => ({ id: st.id, ok: st.state === "pass" }));
}

/** A countersign record as plain strings, for the annotated receipt (safe to pass to client components). */
export interface ReceiptView {
  version: string;
  agentId: string;
  wallet: string;
  txs: { hash: string; what: string; to: string; when: string }[];
  checks: { id: string; ok: boolean }[];
  outcome: Outcome;
}

export function receiptFrom(r: ScenarioResult): ReceiptView {
  return {
    version: short(r.report.versionId),
    agentId: r.actor.agentId === null ? "none" : `#${r.actor.agentId}`,
    wallet: short(r.actor.address),
    txs: r.txs.map(({ tx }) => ({ hash: short(tx.hash), what: tx.effects.join(", "), to: labelOf(tx.to), when: ago(tx.block) })),
    checks: checkFlags(r),
    outcome: r.outcome,
  };
}
