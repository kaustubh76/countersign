import { HARMFUL_REDLINE_RULES } from "@countersign/core/browser";
import type { RedlineReport } from "@countersign/redline";

/**
 * The Red-Line verdict as a stamp. Blocked: a rule that protects the user failed, so the companion refuses
 * to install it. Fails: another hackathon red line failed (the author must fix it; users are warned).
 * Passed: nothing failed, maybe with an advisory.
 */
export function verdictOf(report: RedlineReport): { kind: "ok" | "bad" | "warn"; stamp: string; sub: string } {
  const failed = report.results.filter((r) => !r.passed);
  const warned = report.results.filter((r) => r.passed && r.findings.length > 0);
  const harmful = failed.filter((r) => HARMFUL_REDLINE_RULES.includes(r.rule));
  const ids = (rs: typeof failed) => rs.map((r) => r.rule).join(", ");
  if (harmful.length) return { kind: "bad", stamp: "Blocked", sub: `Fails ${ids(failed)}. The companion would refuse to install it.` };
  if (failed.length) return { kind: "bad", stamp: "Fails", sub: `Fails ${ids(failed)}, a hackathon red line. The companion warns users before they install it.` };
  if (warned.length) return { kind: "warn", stamp: "Passed", sub: `With an advisory: ${ids(warned)}.` };
  return { kind: "ok", stamp: "Passed", sub: `All ${report.results.length} rules, no findings.` };
}
