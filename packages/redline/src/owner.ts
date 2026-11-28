/**
 * RL4 engine: the owner powers in a contract's verified source, and whether a skill discloses them.
 * Pure and deterministic (no network, no clock). sources.ts fetches the verified source this reads.
 *
 * Red line 4 asks that a project's contracts be open source and that their owner permissions be disclosed.
 * This module finds the functions only an admin can call (an owner, role or similar check) that mint, change
 * fees or taxes, pause, freeze or blacklist accounts, withdraw or sweep funds, replace the code, or make
 * arbitrary calls. It then looks for each one in the skill's prose. It reads code structure, not intent:
 * a power behind an unusual guard can be missed, and a negated mention ("the owner cannot …") never counts
 * as a disclosure.
 */
import { isNegated } from "./rules.js";

export type PowerCategory = "mint" | "fee" | "pause" | "freeze" | "withdraw" | "upgrade" | "call";

/** Plain words for each power, for messages. */
export const POWER_WORDS: Record<PowerCategory, string> = {
  mint: "mint new tokens",
  fee: "change fees or taxes",
  pause: "pause the contract",
  freeze: "freeze or blacklist accounts",
  withdraw: "withdraw or sweep the contract's funds",
  upgrade: "replace the contract's code",
  call: "make arbitrary calls from the contract",
};

export interface OwnerPower {
  category: PowerCategory;
  /** The function, e.g. "setTaxes", or "(proxy admin)" for an upgradeable proxy. */
  fn: string;
  /** Its ABI signature when known, e.g. "setTaxes(uint256,uint256)". */
  signature?: string;
  /** What restricts it, e.g. "onlyOwner" or "onlyRole(PAUSER_ROLE)". */
  guard: string;
  file?: string;
  line?: number;
  /** Ownership-only guard while owner() is the zero address (renounced): nobody can call it. */
  dead?: boolean;
}

export interface SourceAnalysis {
  contractName: string | null;
  powers: OwnerPower[];
  /** Other admin-only functions (names only). Listed in the report for transparency, never a finding. */
  others: string[];
  /** Why the source could not be analysed, if it could not (e.g. not Solidity). */
  undetermined?: string;
}

export interface AbiFunction {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: readonly { type: string }[];
}

export interface SourceInput {
  /** path → file content, as verified. */
  sources: Record<string, string>;
  /** The verified (deployed) contract's name, to follow only what it inherits. */
  contractName?: string | null;
  /** The verified ABI: the compiler's own list of external functions. */
  abi?: readonly AbiFunction[] | null;
  language?: string | null;
}

// ── lexing ──────────────────────────────────────────────────────────────────────────────────────

/** Comments and string contents become spaces, so offsets and line numbers stay put. */
function blank(src: string): string {
  const out = src.split("");
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") out[i++] = " ";
    } else if (c === "/" && d === "*") {
      out[i] = out[i + 1] = " ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) {
        out[i] = out[i + 1] = " ";
        i += 2;
      }
    } else if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\" && i + 1 < n) out[i++] = " ";
        out[i++] = " ";
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join("");
}

function matching(text: string, open: number, o = "{", c = "}"): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === o) depth++;
    else if (text[i] === c && --depth === 0) return i;
  }
  return text.length - 1;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

const splitTop = (s: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
};

// ── structure ─────────────────────────────────────────────────────────────────────────────────

interface Unit {
  kind: "contract" | "library" | "interface";
  name: string;
  parents: string[];
  file: string;
  /** The blanked text of the whole file, and the body's bounds within it. */
  text: string;
  start: number;
  end: number;
}

interface FnDef {
  name: string;
  params: string;
  header: string;
  body: string;
  bodyAt: number;
  unit: Unit;
}

const UNIT_RE = /\b(abstract\s+contract|contract|library|interface)\s+([A-Za-z_$][\w$]*)\s*(?:is\s+([^{]*?))?\s*\{/g;

function unitsOf(file: string, text: string): Unit[] {
  const units: Unit[] = [];
  for (const m of text.matchAll(UNIT_RE)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const kind = m[1]!.startsWith("library") ? "library" : m[1]!.startsWith("interface") ? "interface" : "contract";
    const parents = m[3] ? splitTop(m[3]).map((p) => p.trim().split(/[\s(]/)[0]!).filter(Boolean) : [];
    units.push({ kind, name: m[2]!, parents, file, text, start: open, end: matching(text, open) });
  }
  return units;
}

const FN_RE = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
const MOD_RE = /\bmodifier\s+([A-Za-z_$][\w$]*)\s*[({]/g;

function functionsOf(u: Unit): FnDef[] {
  const out: FnDef[] = [];
  const body = u.text.slice(u.start, u.end + 1);
  for (const m of body.matchAll(FN_RE)) {
    const openParen = u.start + (m.index ?? 0) + m[0].length - 1;
    const closeParen = matching(u.text, openParen, "(", ")");
    let i = closeParen + 1;
    let depth = 0;
    while (i < u.end && !(depth === 0 && (u.text[i] === "{" || u.text[i] === ";"))) {
      if (u.text[i] === "(") depth++;
      else if (u.text[i] === ")") depth--;
      i++;
    }
    if (u.text[i] !== "{") continue; // declaration without a body
    const close = matching(u.text, i);
    out.push({
      name: m[1]!,
      params: u.text.slice(openParen + 1, closeParen),
      header: u.text.slice(closeParen + 1, i),
      body: u.text.slice(i + 1, close),
      bodyAt: i + 1,
      unit: u,
    });
  }
  return out;
}

function modifiersOf(u: Unit): Map<string, string> {
  const out = new Map<string, string>();
  const body = u.text.slice(u.start, u.end + 1);
  for (const m of body.matchAll(MOD_RE)) {
    let i = u.start + (m.index ?? 0) + m[0].length - 1;
    if (u.text[i] === "(") i = matching(u.text, i, "(", ")") + 1;
    while (i < u.end && u.text[i] !== "{" && u.text[i] !== ";") i++;
    out.set(m[1]!, u.text[i] === "{" ? u.text.slice(i + 1, matching(u.text, i)) : "");
  }
  return out;
}

// ── guards ────────────────────────────────────────────────────────────────────────────────────

const ADMIN_WORDS =
  "(?:owner|admin|administrator|role|roles|operator|gov|governance|governor|guardian|manager|minter|pauser|keeper|signer|auth|authorized|authorised|controller|dev|team|multisig|treasury|deployer)";
/** onlyOwner, onlyRole(...), onlyAdmin, ownerOnly, auth, requiresAuth — but not onlyTokenOwner or onlyAgentIdHolder. */
const ADMIN_MODIFIER_RE = new RegExp(`^(?:_?only_?${ADMIN_WORDS}\\w*|${ADMIN_WORDS}_?only|if_?${ADMIN_WORDS}|requiresauth|auth|isowner|isadmin)$`, "i");
const ADMIN_NAMES = "(?:owner|admin|administrator|governance|governor|gov|operator|guardian|manager|dev|deployer|controller|signer|treasury|multisig|team|minter|pauser|keeper)";
const SENDER = String.raw`(?:msg\.sender|_msgSender\(\s*\)|tx\.origin)`;
/** An admin reference: owner(), _owner, adminWallet — but not ownerOf(x), owners[x] or a call like owner(x). */
const ADMIN_REF = String.raw`(?:${ADMIN_NAMES}\s*\(\s*\)|_?${ADMIN_NAMES}\w*(?!\w)(?!\s*[(\[]))`;
const ADMIN_CHECK_RE = new RegExp(
  [
    String.raw`\b_check(?:Owner|Role|Roles)\s*\(`,
    String.raw`\b_only${ADMIN_WORDS}\w*\s*\(`,
    String.raw`\bhas(?:Any)?Roles?\s*\(`,
    String.raw`\b_?require(?:Owner|Admin|Role)\w*\s*\(`,
    String.raw`\bisAuthorized\s*\(`,
    String.raw`${SENDER}\s*[!=]=\s*${ADMIN_REF}`,
    String.raw`${ADMIN_REF}\s*[!=]=\s*${SENDER}`,
  ].join("|"),
  "i",
);

const KEYWORDS = new Set(["public", "external", "internal", "private", "view", "pure", "payable", "nonpayable", "virtual", "override", "returns", "constant"]);

/** The admin guard on a function, or null. Modifiers are matched by name, or by what their body checks. */
function guardOf(fn: FnDef, modifiers: Map<string, string>): string | null {
  const header = fn.header.replace(/\breturns\s*\(/g, "returns(");
  for (const m of header.matchAll(/\b([A-Za-z_$][\w$]*)\s*(\([^)]*\))?/g)) {
    const name = m[1]!;
    if (KEYWORDS.has(name)) continue;
    if (name === "returns") continue;
    const body = modifiers.get(name);
    if (ADMIN_MODIFIER_RE.test(name) || (body !== undefined && ADMIN_CHECK_RE.test(body))) {
      return `${name}${m[2] ? m[2].replace(/\s+/g, "") : ""}`;
    }
  }
  const check = ADMIN_CHECK_RE.exec(fn.body);
  return check ? check[0].replace(/\s+/g, " ").trim().slice(0, 48) : null;
}

const visibilityOf = (header: string): string => /\b(public|external|internal|private)\b/.exec(header)?.[1] ?? "public";
const readOnly = (header: string): boolean => /\b(view|pure|constant)\b/.test(header);

// ── categories ────────────────────────────────────────────────────────────────────────────────

const OWNERSHIP_FUNCTIONS = new Set([
  "transferOwnership",
  "renounceOwnership",
  "acceptOwnership",
  "setOwner",
  "setPendingOwner",
  "claimOwnership",
  "transferAdmin",
  "changeAdmin",
  "grantRole",
  "revokeRole",
  "renounceRole",
  "grantRoles",
  "revokeRoles",
  "renounceRoles",
  "beginDefaultAdminTransfer",
  "cancelDefaultAdminTransfer",
  "acceptDefaultAdminTransfer",
  "changeDefaultAdminDelay",
  "rollbackDefaultAdminDelay",
  "requestOwnershipHandover",
  "cancelOwnershipHandover",
  "completeOwnershipHandover",
]);

const NAME_RULES: [PowerCategory, RegExp][] = [
  ["mint", /^(?:mint\w*|minter|airdrop\w*)$/],
  ["fee", /^(?:fees?|tax(?:es)?|commission|royalty|royalties)$/],
  ["pause", /^(?:pause|unpause|paused|halt)$/],
  ["freeze", /^(?:freeze|unfreeze|frozen|blacklist\w*|blocklist\w*|denylist\w*|ban|unban|bot|bots|lock|unlock|restrict\w*|exclude\w*)$/],
  ["withdraw", /^(?:withdraw\w*|sweep\w*|rescue\w*|recover\w*|drain\w*|skim|payout|emergency)$/],
  ["upgrade", /^(?:upgrade\w*|implementation|migrate|migration)$/],
  ["call", /^(?:execute|exec|multicall|delegate)$/],
];

const BODY_RULES: [PowerCategory, RegExp][] = [
  ["mint", /\b_?\w*[mM]int\w*\s*\(|\b_?totalSupply\s*\+=/],
  ["pause", /\b_(?:un)?pause\s*\(|\bpaused\s*=\s*(?:true|false)\b/],
  ["fee", /\b\w*(?:[fF]ee|[tT]ax)\w*\s*(?:\[[^\]]*\]\s*)*(?:=(?!=)|\+=|-=)/],
  ["freeze", /\b\w*(?:[bB]lacklist|[bB]locklist|[dD]enylist|[fF]rozen|[bB]anned|[bB]locked|[iI]sBot|[bB]ots)\w*\s*(?:\[[^\]]*\]\s*)*=(?!=)/],
  ["withdraw", /\.(?:transfer|send)\s*\(|\.call\s*\{\s*value\s*:|\bsafeTransfer(?:From)?\s*\(|\bsendValue\s*\(/],
  ["upgrade", /\b_?upgradeTo\w*\s*\(|\b_setImplementation\s*\(|\bERC1967Utils\s*\.\s*upgrade/],
  ["call", /\.delegatecall\s*\(/],
];

const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_$]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

/** Getters some old proxies leave non-view (admin(), implementation()): they read, they do not act. */
const GETTER_NAMES = new Set(["admin", "implementation", "owner", "getOwner", "pendingOwner"]);

function categoriesOf(fn: FnDef): Set<PowerCategory> {
  const out = new Set<PowerCategory>();
  if (GETTER_NAMES.has(fn.name) && fn.params.trim() === "") return out;
  for (const w of words(fn.name)) for (const [cat, re] of NAME_RULES) if (re.test(w)) out.add(cat);
  for (const [cat, re] of BODY_RULES) if (re.test(fn.body)) out.add(cat);
  if (/\bbytes\b/.test(fn.params) && /\.call\s*(?:\{[^}]*\})?\s*\(/.test(fn.body)) out.add("call");
  // upgradeToAndCall's call is part of the upgrade, not a separate power
  if (out.has("upgrade")) out.delete("call");
  return out;
}

// ── analysis ──────────────────────────────────────────────────────────────────────────────────

const signatureOf = (f: AbiFunction) => `${f.name}(${(f.inputs ?? []).map((i) => i.type).join(",")})`;

/** Every admin-only power in the verified source. */
export function analyzeSources(input: SourceInput): SourceAnalysis {
  const contractName = input.contractName ?? null;
  if (input.language && !/solidity/i.test(input.language)) {
    return { contractName, powers: [], others: [], undetermined: `${input.language} source is not analysed` };
  }
  const units: Unit[] = [];
  for (const path of Object.keys(input.sources).sort()) {
    units.push(...unitsOf(path, blank((input.sources[path] ?? "").replace(/\r\n?/g, "\n"))));
  }
  if (units.length === 0) return { contractName, powers: [], others: [], undetermined: "no Solidity contracts found in the source" };

  // follow only what the deployed contract inherits (duplicate names are all included)
  let scope = units.filter((u) => u.kind === "contract");
  if (contractName && units.some((u) => u.name === contractName)) {
    const seen = new Set<string>();
    const queue = [contractName];
    while (queue.length) {
      const name = queue.shift()!;
      if (seen.has(name)) continue;
      seen.add(name);
      for (const u of units) if (u.name === name) queue.push(...u.parents);
    }
    scope = units.filter((u) => seen.has(u.name) && u.kind === "contract");
  }

  const modifiers = new Map<string, string>();
  for (const u of scope) for (const [k, v] of modifiersOf(u)) if (!modifiers.has(k) || v) modifiers.set(k, v);
  const defs = scope.flatMap(functionsOf);

  // the compiler's own list of external, state-changing functions, when the ABI is known
  const abiFns = input.abi?.filter((f) => f.type === "function" && f.name && f.stateMutability !== "view" && f.stateMutability !== "pure");
  const abiNames = abiFns ? new Set(abiFns.map((f) => f.name!)) : null;
  const signatures = new Map<string, string[]>();
  for (const f of abiFns ?? []) signatures.set(f.name!, [...(signatures.get(f.name!) ?? []), signatureOf(f)]);

  const powers: OwnerPower[] = [];
  const others = new Set<string>();
  const seenPower = new Set<string>();
  for (const fn of defs) {
    const callable = abiNames ? abiNames.has(fn.name) : visibilityOf(fn.header) === "public" || visibilityOf(fn.header) === "external";
    const uups = fn.name === "_authorizeUpgrade";
    if (!uups && (!callable || readOnly(fn.header) || OWNERSHIP_FUNCTIONS.has(fn.name))) continue;
    const guard = guardOf(fn, modifiers);
    if (!guard) continue;
    const cats = uups ? new Set<PowerCategory>(["upgrade"]) : categoriesOf(fn);
    if (cats.size === 0) {
      if (!GETTER_NAMES.has(fn.name)) others.add(fn.name);
      continue;
    }
    const name = uups ? "upgradeToAndCall" : fn.name;
    const sigs = uups ? ["upgradeToAndCall(address,bytes)"] : (signatures.get(fn.name) ?? []);
    for (const category of cats) {
      const key = `${category}:${name}`;
      if (seenPower.has(key)) continue;
      seenPower.add(key);
      powers.push({
        category,
        fn: name,
        ...(sigs.length === 1 ? { signature: sigs[0] } : {}),
        guard,
        file: fn.unit.file,
        line: lineAt(fn.unit.text, fn.bodyAt),
      });
    }
  }
  powers.sort((a, b) => a.category.localeCompare(b.category) || a.fn.localeCompare(b.fn));
  return { contractName, powers, others: [...others].filter((o) => !powers.some((p) => p.fn === o)).sort() };
}

/** owner() is the zero address: powers guarded only by ownership can no longer be used. */
export function markRenounced(powers: readonly OwnerPower[]): OwnerPower[] {
  return powers.map((p) => (/owner/i.test(p.guard) && !/role/i.test(p.guard) ? { ...p, dead: true } : p));
}

// ── disclosure ────────────────────────────────────────────────────────────────────────────────

const DISCLOSURE_WORDS: Record<PowerCategory, RegExp> = {
  mint: /\bmint/i,
  fee: /\b(?:fees?|tax(?:es)?|commission)\b/i,
  pause: /\b(?:un)?paus/i,
  freeze: /\b(?:freez|frozen|blacklist|blocklist|block[- ]list|deny[- ]?list|ban)/i,
  withdraw: /\b(?:withdraw|sweep|rescue|recover|drain)/i,
  upgrade: /\b(?:upgrad|proxy|implementation)/i,
  call: /\b(?:arbitrary|any)\s+calls?\b|\bexecute\b/i,
};
const OWNER_WORD_RE = /\b(?:owner|admin|administrator|operator|deployer|team|multisig|multi-sig|governance|governor|guardian|role|privileged|controller)s?\b/i;

/**
 * Does the skill's prose disclose this power? Yes if it gives the exact signature, or if one sentence names
 * an owner/admin and either the function or the power ("the owner can pause transfers"), not negated.
 */
export function isDisclosed(power: OwnerPower, prose: readonly string[]): boolean {
  for (const text of prose) {
    if (power.signature && text.includes(power.signature)) return true;
    for (const sentence of text.split(/(?<=[.!?;])\s+|\n+/)) {
      if (!OWNER_WORD_RE.test(sentence)) continue;
      const byName = power.fn.startsWith("(") ? -1 : sentence.search(new RegExp(`\\b${power.fn.replace(/\$/g, "\\$")}\\b`));
      const byWord = DISCLOSURE_WORDS[power.category].exec(sentence)?.index ?? -1;
      const at = byName >= 0 ? byName : byWord;
      if (at >= 0 && !isNegated(sentence, at)) return true;
    }
  }
  return false;
}
