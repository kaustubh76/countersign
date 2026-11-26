/** Results are printed as JSON (for agents, with --json) or as plain text (for humans). */

export type Verdict = "allow" | "warn" | "block";

export interface Reason {
  level: "ok" | "warn" | "block" | "info";
  text: string;
}

export interface Result {
  ok: boolean;
  command: string;
  /** One or two sentences the agent can show the user as-is. */
  say: string;
  verdict?: Verdict;
  reasons?: Reason[];
  /** Exact next command(s) for the agent, if any. Never an `execute`. */
  next?: { what: string; run?: string }[];
  data?: Record<string, unknown>;
}

const ICON: Record<Reason["level"], string> = { ok: "✓", warn: "!", block: "✗", info: "·" };

function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function print(result: Result, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, replacer, 2)}\n`);
    return;
  }
  const lines: string[] = [];
  const head = result.verdict ? `[${result.verdict.toUpperCase()}] ` : result.ok ? "" : "[ERROR] ";
  lines.push(`${head}${result.say}`);
  for (const r of result.reasons ?? []) lines.push(`  ${ICON[r.level]} ${r.text}`);
  for (const n of result.next ?? []) {
    lines.push(`  → ${n.what}`);
    if (n.run) lines.push(`    ${n.run}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function verdictOf(reasons: readonly Reason[]): Verdict {
  if (reasons.some((r) => r.level === "block")) return "block";
  if (reasons.some((r) => r.level === "warn")) return "warn";
  return "allow";
}
