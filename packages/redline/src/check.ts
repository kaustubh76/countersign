import { getAddress, isAddressEqual, keccak256, toBytes, zeroAddress, type Address, type Hex } from "viem";
import {
  AGENT_ID_BSC,
  FLAG_ANCHOR,
  FLAG_PULL,
  hashSkillFiles,
  MANIFEST_FILE,
  parseManifest,
  type ParsedManifest,
  type SkillFile,
} from "@countersign/core/browser";
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
  type Severity,
} from "./rules.js";
import { isDisclosed, POWER_WORDS } from "./owner.js";
import type { AnalyzedContract, ProxyInfo, SourceProvider, SourceStatus } from "./sources.js";

export const RULESET = "countersign.redline/v1";
export const TOOL = "countersign-redline";
export const TOOL_VERSION = "1.1.0";

const CHECKED: RuleId[] = ["RL1", "RL2", "RL3", "RL5", "RL6", "RL7", "RL8"];
const PROSE_RE = /\.(md|markdown|txt)$/i;
/** RL8 is advisory: it can only warn. */
const ADVISORY: ReadonlySet<RuleId> = new Set(["RL8"]);

/** Well-known addresses a skill may mention without declaring them (all BSC mainnet). */
export const WELL_KNOWN: Record<string, string> = {
  [AGENT_ID_BSC.toLowerCase()]: "Agent ID registry",
  "0x55d398326f99059ff775485246999027b3197955": "USDT (BSC-USD)",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "WBNB",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Permit2",
  "0xca11bde05977b3631167028862be2a173976ca11": "Multicall3 (same address on every EVM chain)",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": "native-token placeholder (EIP-7528)",
  "0x000000000000000000000000000000000000dead": "burn address",
  [zeroAddress]: "zero address",
};

const TEXT_EXTENSIONS = /\.(md|markdown|txt|mjs|cjs|js|ts|tsx|jsx|json|ya?ml|toml|sh|bash|zsh|py|sol|html?|css|env|ini|cfg|conf)$/i;
const ADDRESS_RE = /\b0x[0-9a-fA-F]{40}\b/g;
/** Files whose lines are code rather than prose (a hard-coded address in a call there is an instruction). */
const CODE_FILE_RE = /\.(mjs|cjs|js|ts|tsx|jsx|py|sh|bash|zsh|sol)$/i;
/** A call on the same line that can move or authorise moving funds. */
const FUND_CALL_RE = /\b(?:transfer|transferFrom|safeTransfer|safeTransferFrom|approve|increaseAllowance|permit|setApprovalForAll|sendTransaction|sendValue)\s*\(|\.call\s*\{\s*value\b/;
const URL_HOST_RE = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;

export interface RuleResult {
  rule: RuleId;
  title: string;
  passed: boolean;
  findings: Finding[];
}

/** How a contract counts for RL4. Only project contracts can fail it. */
export type ContractRole = "project" | "third-party" | "mentioned";

/** A contract as recorded in the report: the inputs RL4 read, so anyone can re-run it. */
export interface ContractSummary {
  address: Address;
  role: ContractRole;
  status: SourceStatus;
  provider?: SourceProvider;
  contractName?: string | null;
  sourceHash?: Hex;
  codehash?: Hex;
  owner?: Address | null;
  proxy?: ProxyInfo;
  implementation?: { address: Address; status: SourceStatus; provider?: SourceProvider; contractName?: string | null; sourceHash?: Hex; codehash?: Hex };
  powers: { category: string; fn: string; signature?: string; guard: string; disclosed: boolean; dead?: boolean }[];
  others: string[];
}

export interface RedlineReport {
  tool: string;
  toolVersion: string;
  ruleset: string;
  checkerCommit: string | null;
  input: { contentHash: Hex; manifestHash: Hex | null; fileCount: number; contracts?: ContractSummary[] };
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
  /** The author's own contracts, given alongside the skill ("skill repo + contracts"). They count as declared. */
  projectContracts?: readonly string[];
  /**
   * The contracts' verified source, analysed (sources.ts). When given, RL4 runs: every owner power in a project
   * contract must be disclosed in the skill's prose. When absent, RL4 is not run and leaves no trace.
   */
  contracts?: readonly AnalyzedContract[];
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
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
  const declared = declaredAddresses(manifest, [...(opts.extraKnown ?? []), ...(opts.projectContracts ?? [])]);
  const namesUndeclared = (line: string) => [...line.matchAll(ADDRESS_RE)].some((a) => !declared.has(a[0].toLowerCase()));

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
          const fixed = p.fixedRecipientFails === true && namesUndeclared(lineAround(text, index));
          findings.push({
            rule: p.rule,
            severity: fixed ? "fail" : p.severity,
            file: f.path,
            line: lineOf(text, index),
            snippet: snippetAt(text, index, m[0].length),
            message: fixed ? `${p.message} to a fixed address that is not declared` : p.message,
          });
        }
      }
      if (TRADING_RE.test(text)) tradesAnywhere = true;
      if (RISK_WARNING_RE.test(text)) warnsAnywhere = true;
    }

    // RL3: addresses that nothing declares (an attacker's recipient hides here). With a manifest, every
    // undeclared address fails. Without one, only an address handed to a fund-moving call in code fails;
    // elsewhere it is advisory, so an honest skill that names its own contract is not marked as failing.
    for (const m of text.matchAll(ADDRESS_RE)) {
      const addr = m[0].toLowerCase();
      if (declared.has(addr)) continue;
      const index = m.index ?? 0;
      const a = getAddress(m[0] as Address);
      let severity: Severity = "fail";
      let message = `address ${a} is not declared in ${MANIFEST_FILE} (undeclared recipient or spender)`;
      if (!manifest) {
        if (CODE_FILE_RE.test(f.path) && FUND_CALL_RE.test(lineAround(text, index))) {
          message = `address ${a} is hard-coded into a call that can move funds, and is not declared in any ${MANIFEST_FILE}`;
        } else {
          severity = "warn";
          message = `address ${a} is not declared: add ${MANIFEST_FILE} (or list it as your contract) so calls to it can be checked`;
        }
      }
      findings.push({
        rule: "RL3",
        severity,
        file: f.path,
        line: lineOf(text, index),
        snippet: snippetAt(text, index, m[0].length),
        message,
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
      message: "trading skill without a risk warning",
    });
  }

  // RL4: owner powers in the project's verified contracts, disclosed in the skill's own prose
  const rulesRun = [...CHECKED];
  let contractSummaries: ContractSummary[] | undefined;
  if (opts.contracts) {
    const rl4 = ownerPowers(files, manifest, opts.contracts, opts.projectContracts ?? []);
    contractSummaries = rl4.summaries;
    findings.push(...rl4.findings);
    if (rl4.checked) rulesRun.splice(3, 0, "RL4");
    else notes.push(...rl4.notes);
  }

  let rulesChecked = 0;
  let rulesPassed = 0;
  const results: RuleResult[] = rulesRun.map((rule) => {
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
    input: {
      contentHash,
      manifestHash: manifest?.manifestHash ?? null,
      fileCount: files.length,
      ...(contractSummaries ? { contracts: contractSummaries } : {}),
    },
    rulesChecked,
    rulesPassed,
    results,
    notes: notes.sort(),
  };
}

function ownerPowers(
  files: readonly SkillFile[],
  manifest: ParsedManifest | null,
  contracts: readonly AnalyzedContract[],
  explicit: readonly string[],
): { findings: Finding[]; notes: string[]; checked: boolean; summaries: ContractSummary[] } {
  const prose = files
    .filter((f) => PROSE_RE.test(f.path) || /(^|\/)SKILL\.md$/i.test(f.path))
    .map((f) => decodeText(f))
    .filter((t): t is string => t !== null);
  const target = (a: Address) => manifest?.onchain.targets.find((t) => isAddressEqual(t.target, a));
  const roleOf = (a: Address): ContractRole | null => {
    if (WELL_KNOWN[a.toLowerCase()]) return null;
    if (explicit.some((x) => x.toLowerCase() === a.toLowerCase())) return "project";
    const t = target(a);
    if (t) return (t.flags & (FLAG_ANCHOR | FLAG_PULL)) !== 0 ? "project" : "third-party";
    return "mentioned";
  };
  const findings: Finding[] = [];
  const inconclusive: string[] = [];
  const summaries: ContractSummary[] = [];
  let projects = 0;
  const where = manifest ? MANIFEST_FILE : "SKILL.md";
  for (const c of [...contracts].sort((x, y) => x.address.toLowerCase().localeCompare(y.address.toLowerCase()))) {
    const role = roleOf(c.address);
    if (!role) continue;
    const label = `${c.contractName ?? "contract"} ${c.address}`;
    const impl = c.implementation;
    const powers = [...c.powers, ...(impl?.status === "verified" ? impl.powers : [])];
    summaries.push({
      address: c.address,
      role,
      status: c.status,
      ...(c.provider ? { provider: c.provider } : {}),
      ...(c.contractName !== undefined ? { contractName: c.contractName } : {}),
      ...(c.sourceHash ? { sourceHash: c.sourceHash } : {}),
      ...(c.codehash ? { codehash: c.codehash } : {}),
      ...(c.owner !== undefined ? { owner: c.owner } : {}),
      ...(c.proxy ? { proxy: c.proxy } : {}),
      ...(impl
        ? {
            implementation: {
              address: impl.address,
              status: impl.status,
              ...(impl.provider ? { provider: impl.provider } : {}),
              ...(impl.contractName !== undefined ? { contractName: impl.contractName } : {}),
              ...(impl.sourceHash ? { sourceHash: impl.sourceHash } : {}),
              ...(impl.codehash ? { codehash: impl.codehash } : {}),
            },
          }
        : {}),
      powers: powers.map((p) => ({
        category: p.category,
        fn: p.fn,
        ...(p.signature ? { signature: p.signature } : {}),
        guard: p.guard,
        disclosed: isDisclosed(p, prose),
        ...(p.dead ? { dead: true } : {}),
      })),
      others: [...c.others, ...(impl?.status === "verified" ? impl.others : [])].sort(),
    });
    if (role !== "project") continue; // third-party and mentioned contracts are listed, never a finding
    projects++;
    const fail = (message: string, snippet: string) =>
      findings.push({ rule: "RL4", severity: "fail", file: where, line: 1, snippet, message });
    if (c.status === "unverified") {
      fail(`${label}: its source is not verified on BscScan (red line 4 asks for open source)`, c.address);
      continue;
    }
    if (c.status !== "verified") {
      inconclusive.push(`${c.address}: ${c.detail ?? c.status}`);
      continue;
    }
    if (impl && impl.status !== "verified") inconclusive.push(`${impl.address} (implementation of ${c.address}): ${impl.detail ?? impl.status}`);
    const t = target(c.address);
    if (c.proxy && c.proxy.kind !== "clone" && t && t.impl === zeroAddress) {
      fail(`${label} is an upgradeable proxy: declare its implementation ("impl") in ${MANIFEST_FILE}, so an upgrade is caught`, c.address);
    }
    for (const p of powers) {
      if (p.dead || isDisclosed(p, prose)) continue;
      fail(`${label}: an admin can ${POWER_WORDS[p.category]} (${p.signature ?? p.fn}, ${p.guard}), and the skill does not say so`, `${p.signature ?? p.fn} · ${p.guard}`);
    }
  }
  // A definite failure stands even if another contract could not be read; a pass needs every one.
  const failed = findings.length > 0;
  const checked = projects > 0 && (failed || inconclusive.length === 0);
  const notes = checked
    ? []
    : projects === 0
      ? ["RL4 not checked: no project contracts (anchor or pull targets in countersign.json, or contracts given with the skill)"]
      : inconclusive.map((x) => `RL4 not checked: ${x}`);
  return { findings, notes, checked, summaries };
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
