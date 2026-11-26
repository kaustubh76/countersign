import { getAddress, keccak256, toBytes, zeroAddress, type Address, type Hex } from "viem";
import {
  AGENT_ID_BSC,
  hashSkillFiles,
  MANIFEST_FILE,
  parseManifest,
  type ParsedManifest,
  type SkillFile,
} from "@countersign/core";
import {
  BRAND_RE,
  isNegated,
  isOfficialHost,
  RISK_WARNING_RE,
  RULE_BITS,
  RULE_TITLES,
  TEXT_PATTERNS,
  TRADING_RE,
  type Finding,
  type RuleId,
} from "./rules.js";

export const RULESET = "countersign.redline/v1";
export const TOOL = "countersign-redline";
export const TOOL_VERSION = "1.0.0";

const CHECKED: RuleId[] = ["RL1", "RL2", "RL3", "RL5", "RL6", "RL7", "RL8"];
/** RL8 is advisory: it can only warn. */
const ADVISORY: ReadonlySet<RuleId> = new Set(["RL8"]);

/** Well-known addresses a skill may mention without declaring them (all BSC mainnet). */
export const WELL_KNOWN: Record<string, string> = {
  [AGENT_ID_BSC.toLowerCase()]: "Agent ID registry",
  "0x55d398326f99059ff775485246999027b3197955": "USDT (BSC-USD)",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "WBNB",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Permit2",
  "0x000000000000000000000000000000000000dead": "burn address",
  [zeroAddress]: "zero address",
};

const TEXT_EXTENSIONS = /\.(md|markdown|txt|mjs|cjs|js|ts|tsx|jsx|json|ya?ml|toml|sh|bash|zsh|py|sol|html?|css|env|ini|cfg|conf)$/i;
const ADDRESS_RE = /\b0x[0-9a-fA-F]{40}\b/g;
const URL_HOST_RE = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;

export interface RuleResult {
  rule: RuleId;
  title: string;
  passed: boolean;
  findings: Finding[];
}

export interface RedlineReport {
  tool: string;
  toolVersion: string;
  ruleset: string;
  checkerCommit: string | null;
  input: { contentHash: Hex; manifestHash: Hex | null; fileCount: number };
  rulesChecked: number;
  rulesPassed: number;
  results: RuleResult[];
  /** Non-rule problems (unreadable manifest, binary files skipped, …). */
  notes: string[];
}

export interface CheckOptions {
  checkerCommit?: string | null;
  /** Extra addresses to treat as declared (e.g. COUNTERSIGN's own contracts). */
  extraKnown?: readonly string[];
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function snippetAt(text: string, index: number, length: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const endNl = text.indexOf("\n", index + length);
  const line = text.slice(start, endNl === -1 ? text.length : endNl).trim();
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

function decodeText(f: SkillFile): string | null {
  if (!TEXT_EXTENSIONS.test(f.path) && !/(^|\/)[A-Z]+$/.test(f.path)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(f.bytes);
  } catch {
    return null;
  }
}

function frontmatterName(text: string): string | null {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!fm) return null;
  const name = /^name:\s*["']?([^"'\n]+)["']?\s*$/m.exec(fm[1] ?? "");
  return name?.[1]?.trim() ?? null;
}

function declaredAddresses(manifest: ParsedManifest | null, extra: readonly string[]): Set<string> {
  const s = new Set<string>(Object.keys(WELL_KNOWN));
  for (const a of extra) s.add(a.toLowerCase());
  if (!manifest) return s;
  s.add(manifest.publisher.toLowerCase());
  for (const t of manifest.onchain.targets) {
    s.add(t.target.toLowerCase());
    s.add(t.impl.toLowerCase());
  }
  for (const f of manifest.onchain.flows) {
    s.add(f.token.toLowerCase());
    s.add(f.counterparty.toLowerCase());
  }
  return s;
}

/** Run every v1 rule over a skill's files. Pure: no network, no clock. */
export function checkSkill(files: readonly SkillFile[], opts: CheckOptions = {}): RedlineReport {
  const { contentHash } = hashSkillFiles(files);
  const notes: string[] = [];
  const findings: Finding[] = [];

  let manifest: ParsedManifest | null = null;
  const manifestFile = files.find((f) => f.path === MANIFEST_FILE || f.path === `./${MANIFEST_FILE}`);
  if (!manifestFile) {
    notes.push(`no ${MANIFEST_FILE}: every address in the skill counts as undeclared`);
  } else {
    try {
      manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestFile.bytes)));
    } catch (e) {
      notes.push(`${MANIFEST_FILE} is invalid: ${(e as Error).message}`);
    }
  }
  const declared = declaredAddresses(manifest, opts.extraKnown ?? []);

  let tradesAnywhere = false;
  let warnsAnywhere = false;

  for (const f of files) {
    const text = decodeText(f);
    if (text === null) {
      notes.push(`skipped non-text file ${f.path}`);
      continue;
    }
    const isManifest = f.path === MANIFEST_FILE;

    if (!isManifest) {
      for (const p of TEXT_PATTERNS) {
        p.re.lastIndex = 0;
        for (const m of text.matchAll(p.re)) {
          const index = m.index ?? 0;
          if (p.negatable && isNegated(text, index)) continue;
          findings.push({
            rule: p.rule,
            severity: p.severity,
            file: f.path,
            line: lineOf(text, index),
            snippet: snippetAt(text, index, m[0].length),
            message: p.message,
          });
        }
      }
      if (TRADING_RE.test(text)) tradesAnywhere = true;
      if (RISK_WARNING_RE.test(text)) warnsAnywhere = true;
    }

    // RL3: addresses that the manifest does not declare (an attacker's recipient hides here)
    for (const m of text.matchAll(ADDRESS_RE)) {
      const addr = m[0].toLowerCase();
      if (declared.has(addr)) continue;
      const index = m.index ?? 0;
      findings.push({
        rule: "RL3",
        severity: "fail",
        file: f.path,
        line: lineOf(text, index),
        snippet: snippetAt(text, index, m[0].length),
        message: `address ${getAddress(m[0] as Address)} is not declared in ${MANIFEST_FILE}`,
      });
    }

    // RL5: lookalike brand domains anywhere, and brand words in the skill's name
    for (const m of text.matchAll(URL_HOST_RE)) {
      const host = (m[1] ?? "").toLowerCase();
      if (BRAND_RE.test(host) && !isOfficialHost(host)) {
        const index = m.index ?? 0;
        findings.push({
          rule: "RL5",
          severity: "fail",
          file: f.path,
          line: lineOf(text, index),
          snippet: snippetAt(text, index, m[0].length),
          message: `domain "${host}" uses the Binance/BNB brand but is not an official domain`,
        });
      }
    }
    if (/(^|\/)SKILL\.md$/i.test(f.path)) {
      const name = frontmatterName(text);
      if (name && BRAND_RE.test(name)) {
        findings.push({
          rule: "RL5",
          severity: "fail",
          file: f.path,
          line: lineOf(text, text.indexOf(name)),
          snippet: `name: ${name}`,
          message: "skill name uses the Binance/BNB brand",
        });
      }
    }
  }
  if (manifest?.name && BRAND_RE.test(manifest.name)) {
    findings.push({
      rule: "RL5",
      severity: "fail",
      file: MANIFEST_FILE,
      line: 1,
      snippet: `"name": "${manifest.name}"`,
      message: "manifest name uses the Binance/BNB brand",
    });
  }
  if (tradesAnywhere && !warnsAnywhere) {
    findings.push({
      rule: "RL8",
      severity: "warn",
      file: "SKILL.md",
      line: 1,
      snippet: "",
      message: "the skill trades but shows no risk warning",
    });
  }

  let rulesChecked = 0;
  let rulesPassed = 0;
  const results: RuleResult[] = CHECKED.map((rule) => {
    const own = findings
      .filter((x) => x.rule === rule)
      .map((x) => (ADVISORY.has(rule) ? { ...x, severity: "warn" as const } : x))
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.message.localeCompare(b.message));
    const passed = !own.some((x) => x.severity === "fail");
    rulesChecked |= RULE_BITS[rule];
    if (passed) rulesPassed |= RULE_BITS[rule];
    return { rule, title: RULE_TITLES[rule], passed, findings: own };
  });

  return {
    tool: TOOL,
    toolVersion: TOOL_VERSION,
    ruleset: RULESET,
    checkerCommit: opts.checkerCommit ?? null,
    input: { contentHash, manifestHash: manifest?.manifestHash ?? null, fileCount: files.length },
    rulesChecked,
    rulesPassed,
    results,
    notes: notes.sort(),
  };
}

export function allPassed(report: RedlineReport): boolean {
  return report.rulesPassed === report.rulesChecked;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Canonical JSON (sorted keys, no whitespace). Its keccak256 is the reportHash stored on-chain. */
export function canonicalReportJson(report: RedlineReport): string {
  return JSON.stringify(canonicalize(report));
}

export function reportHash(report: RedlineReport): Hex {
  return keccak256(toBytes(canonicalReportJson(report)));
}
