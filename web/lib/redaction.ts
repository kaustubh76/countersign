import type { SkillFile } from "@countersign/core/browser";
import type { RedlineReport } from "@countersign/redline";

/** Short names for the Red-Line rules (the full messages are on /check). */
export const RULE_SHORT: Record<string, string> = {
  RL1: "pairing outside the official app",
  RL2: "talks you out of confirming",
  RL3: "uncapped approval",
  RL5: "brand impersonation",
  RL6: "asks for wallet secrets",
  RL7: "promises returns",
  RL8: "no risk warning",
};

export interface RedactedNote {
  rule: string;
  short: string;
  sev: "fail" | "warn";
}
export interface RedactedLine {
  n: number;
  /** Characters on the line, capped: only the shape of the text, never the text. */
  len: number;
  notes: RedactedNote[];
}
export interface RedactedFile {
  path: string;
  lines: RedactedLine[];
}

/**
 * A skill as the Red-Line Check saw it, with every word removed: line numbers, line lengths and the rules
 * each line broke. Used to show the deliberately malicious sample without ever printing its wording.
 */
export function redact(files: SkillFile[], report: RedlineReport, maxLen = 72): RedactedFile[] {
  const failed = new Set(report.results.filter((r) => !r.passed).map((r) => r.rule));
  return files.map((f) => {
    const text = new TextDecoder().decode(f.bytes).replace(/\n+$/, "");
    const lines = text.split("\n").map((line, i) => {
      const n = i + 1;
      const notes: RedactedNote[] = [];
      for (const r of report.results)
        if (r.findings.some((x) => x.file === f.path && x.line === n) && !notes.some((x) => x.rule === r.rule))
          notes.push({ rule: r.rule, short: RULE_SHORT[r.rule] ?? r.rule, sev: failed.has(r.rule) ? "fail" : "warn" });
      return { n, len: Math.min(maxLen, line.trimEnd().length), notes };
    });
    return { path: f.path, lines };
  });
}
