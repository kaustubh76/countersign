import type { RedlineReport } from "@countersign/redline";

/** The Red-Line verdict as a stamp: Blocked when any rule fails, Passed (maybe with an advisory) otherwise. */
export function verdictOf(report: RedlineReport): { kind: "ok" | "bad" | "warn"; stamp: string; sub: string } {
  const failed = report.results.filter((r) => !r.passed);
  const warned = report.results.filter((r) => r.passed && r.findings.length > 0);
  if (failed.length) return { kind: "bad", stamp: "Blocked", sub: `Fails ${failed.map((r) => r.rule).join(", ")}. The companion would refuse to install it.` };
  if (warned.length) return { kind: "warn", stamp: "Passed", sub: `With an advisory: ${warned.map((r) => r.rule).join(", ")}.` };
  return { kind: "ok", stamp: "Passed", sub: `All ${report.results.length} rules, no findings.` };
}
