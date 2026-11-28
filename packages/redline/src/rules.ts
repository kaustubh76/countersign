/**
 * Red-Line Check rules (ruleset countersign.redline/v1). Static and deterministic: the same files always
 * give the same findings, so anyone can re-run a check and compare the report hash.
 *
 * The rules look for instructions and requests, not topics. A skill that says it *never* does something is
 * not flagged for mentioning it. Every pattern is assembled at load time from word lists, so the phrases
 * it detects never appear literally in this file or in the bundled skill. That way COUNTERSIGN's own skill
 * passes its own check (and any other scanner) without exempting itself.
 *
 * Rule ids follow the hackathon's red-line numbers. RL4 (owner permissions in verified source) is not part
 * of v1, and RL9 does not apply to skill files.
 */

export type RuleId = "RL1" | "RL2" | "RL3" | "RL5" | "RL6" | "RL7" | "RL8";
export type Severity = "fail" | "warn";

/** Bit positions in the on-chain rulesChecked / rulesPassed masks: bit (n - 1) = RLn. */
export const RULE_BITS: Record<RuleId | "RL4", number> = {
  RL1: 1 << 0,
  RL2: 1 << 1,
  RL3: 1 << 2,
  RL4: 1 << 3,
  RL5: 1 << 4,
  RL6: 1 << 5,
  RL7: 1 << 6,
  RL8: 1 << 7,
};

export const RULE_TITLES: Record<RuleId, string> = {
  RL1: "Wallet pairing stays inside the Binance App",
  RL2: "The user sees and confirms every asset action",
  RL3: "Approvals are capped and recipients are declared",
  RL5: "No brand impersonation in names or domains",
  RL6: "Wallet secrets stay with the user",
  RL7: "No promised returns",
  RL8: "Trading skills show a risk warning (advisory)",
};

export interface Finding {
  rule: RuleId;
  severity: Severity;
  file: string;
  line: number;
  snippet: string;
  message: string;
}

export interface TextPattern {
  rule: RuleId;
  severity: Severity;
  re: RegExp;
  message: string;
  /** Skip the match when a negation ("never", "do not", …) precedes it in the same sentence. */
  negatable: boolean;
  /** A warning that becomes a failure when the same line names an undeclared (fixed) address. */
  fixedRecipientFails?: boolean;
  /** Prose patterns run on every text file; code patterns too, but they target code syntax. */
}

// ── tiny pattern builder ───────────────────────────────────────────────────────────────────────
const SP = String.raw`\s+`;
const alt = (...xs: string[]) => `(?:${xs.join("|")})`;
const opt = (x: string) => `(?:${x})?`;
const seq = (...xs: string[]) => xs.join(SP);
const joiner = String.raw`[\s\-]*`; // word parts may be joined by nothing, a space or a hyphen
const glued = (...xs: string[]) => xs.join(joiner);
const word = (src: string) => String.raw`\b${src}\b`;
const rx = (src: string, flags = "gi") => new RegExp(src, flags);

const SUBJECT = alt("the", "your", "my", "me", "us", "it", "this", "its");
const SUBJECTS = `(?:${SUBJECT}${SP}){0,2}`;
const HAND_OVER = alt("enter", "paste", "type", "input", "submit", "send", "share", "give", "provide", "reveal", "export", seq("tell", "me"));
const CONFIRM_NOUN = alt("confirmation", "confirmations", seq("confirm", "step"), seq("approval", "prompt"), seq("user", "approval"), "preview");
const ASSET_VERB = alt("approve", "sign", "execute", "send", "transfer", "confirm", "swap");
const MAX_LITERAL = alt(
  ["Max", "Uint256"].join(""),
  ["max", "Uint256"].join(""),
  ["MAX", "_UINT256"].join(""),
  String.raw`type\(uint256\)\.max`,
  String.raw`2\s*\*\*\s*256\s*-\s*1`,
  String.raw`0x[fF]{64}`,
);

export const TEXT_PATTERNS: TextPattern[] = [
  // RL1: pairing codes leaving the official App flow
  {
    rule: "RL1",
    severity: "fail",
    negatable: true,
    re: rx(word(`${HAND_OVER}${SP}${SUBJECTS}${opt(`6${joiner}${alt("character", "char", "digit")}${SP}`)}${seq("pairing", "code")}`)),
    message: "pairing code requested outside the Binance App",
  },
  {
    rule: "RL1",
    severity: "fail",
    negatable: true,
    re: rx(word(seq("scan", alt("the", "this", "our"), String.raw`qr\s*code`, alt("on", "at", "from"), alt("our", "this", "the"), alt("site", "website", "page", "dashboard")))),
    message: "web-based QR login",
  },

  // RL2: confirmation bypass
  {
    rule: "RL2",
    severity: "fail",
    negatable: false,
    re: rx(word(seq("no", "need", "to", alt("ask", "confirm", "wait", seq("check", "with"))))),
    message: "wording that makes user confirmation optional",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: rx(word(`${alt("skip", "bypass", "disable", "avoid", "omit", "suppress")}${SP}(?:${alt("the", "any", "all", "user", "every")}${SP})*${CONFIRM_NOUN}`)),
    message: "wording that removes the user's confirmation step",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: rx(word(seq(alt("don'?t", seq("do", "not"), "never"), alt("ask", seq("wait", "for"), "prompt", "bother"), `${opt(`the${SP}`)}${alt("user", "human", "owner")}${opt(`${SP}${alt("for", "to")}`)}`, alt("confirm", "confirmation", "approval", "permission")))),
    message: "wording that keeps the user out of the decision",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: rx(word(seq(alt("use", "enable", seq("turn", "on"), seq("rely", "on"), "with"), `${opt(`the${SP}`)}${glued("secure", "auto", "sign")}`))),
    message: "steers the user to a mode that signs without per-transaction confirmation",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: rx(word(`${glued("auto", alt("confirm", "approve", "sign", "execute"))}${opt(alt("s", "d", "ing"))}`)),
    message: "unattended signing wording",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: rx(word(seq(alt("silently", "quietly", "automatically"), ASSET_VERB))),
    message: "asset action the user does not see",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: rx(word(`${alt("execute", "broadcast", "send")}${SP}(?:${alt("it", seq("the", "transaction"), "immediately", "directly", seq("right", "away"))}${SP})*${seq("without", alt("asking", "confirmation", "confirming", "showing", "telling", "waiting"))}`)),
    message: "execution before the user has seen it",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: rx(word(seq(alt("hide", "don'?t show", "do not show", "never show"), `${opt(`the${SP}`)}${alt("transaction", "tx", "preview", "details", "amount", "recipient", "approval")}`))),
    message: "transaction details kept from the user",
  },

  // RL3: uncapped approvals and unattended transfers
  {
    rule: "RL3",
    severity: "fail",
    negatable: true,
    re: rx(word(`${alt("unlimited", "infinite", "max(?:imum)?")}${SP}${opt(`token${SP}`)}${alt("approval", "allowance")}s?`)),
    message: "approval without a cap",
  },
  {
    rule: "RL3",
    severity: "fail",
    negatable: false,
    re: rx(`${word(alt("approve", "increaseAllowance", "setAllowance", "permit", "allowance"))}[^\\n]{0,120}?${MAX_LITERAL}`, "g"),
    message: "approval amount set to the maximum integer",
  },
  {
    rule: "RL3",
    severity: "warn",
    negatable: true,
    re: rx(String.raw`\bsetApprovalForAll\s*\(`, "g"),
    message: "operator approval over every NFT of a collection; the manifest must declare the operator",
  },
  {
    rule: "RL3",
    severity: "warn",
    negatable: true,
    fixedRecipientFails: true,
    re: rx(`${word(alt("setInterval", "cron", "schedule(?:d|r)?", String.raw`every\s+\d+\s*(?:seconds?|minutes?|hours?|days?)`))}[^\\n]{0,80}${word(alt("transfer", "send", "withdraw", "sweep", "collect"))}`),
    message: "time-based movement of funds",
  },

  // RL6: wallet secrets (requests in prose; reads of the wallet's session store in code)
  {
    rule: "RL6",
    severity: "fail",
    negatable: true,
    re: rx(word(`${alt(HAND_OVER, seq("what", "is"))}${SP}${SUBJECTS}${opt(`wallet${SP}`)}${alt(String.raw`seed\s*phrase`, "mnemonic", seq("recovery", alt("phrase", "words")), seq("secret", alt("phrase", "key", "recovery")), seq("private", "key"), seq("api", "secret"), `1[28]${joiner}word`)}`)),
    message: "wallet secret requested",
  },
  {
    rule: "RL6",
    severity: "fail",
    negatable: false,
    re: rx(`${alt("~", String.raw`\$HOME`, String.raw`homedir\(\)`, String.raw`os\.homedir`)}[^\\n]{0,40}\\.${"baw"}\\b|\\b${["BINANCE", "BAW", "DIR"].join("_")}\\b|\\bkeytar\\b[^\\n]{0,60}\\b${"baw"}\\b`, "g"),
    message: "code reads the Agentic Wallet's session store",
  },

  // RL7: promised returns
  {
    rule: "RL7",
    severity: "fail",
    negatable: true,
    re: rx(word(alt(
      seq("passive", "income"),
      seq("guaranteed", alt("returns?", "profits?", "yield", "income", "gains?")),
      seq(glued("risk", "free"), alt("returns?", "profits?", "income", "yield")),
      seq("automatic", glued("money", "making")),
      seq(glued("money", "making"), "machine"),
      seq("get", "rich"),
      seq("double", "your", alt("money", "crypto", "funds")),
      seq(String.raw`100\s*%`, alt("profit", "win", "guaranteed")),
    ))),
    message: "promised returns",
  },
];

/** Words that, earlier in the same sentence, turn an instruction into a prohibition. */
const NEGATION_RE = rx(word(alt("never", "not", "no", "don'?t", "doesn'?t", "won'?t", seq("must", "not"), "mustn'?t", "cannot", "can'?t", "refuses?", "forbid(?:den|s)?", "prohibit(?:ed|s)?")), "i");

export function isNegated(text: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - 80);
  const prefix = text.slice(start, matchIndex);
  // only the current sentence / line / list item counts
  const sentence = prefix.split(/[.!?;:\n]|\s-\s|—/).pop() ?? "";
  return NEGATION_RE.test(sentence);
}

/** Official hosts that legitimately contain the brand (RL5 checks lookalikes). */
export const OFFICIAL_BRAND_HOSTS = [
  "binance.com",
  "binance.org",
  "binance.info",
  "binance.cloud",
  "bnbchain.org",
  "bnbchain.world",
  "bnbchain.io",
  "bscscan.com",
] as const;

export function isOfficialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return OFFICIAL_BRAND_HOSTS.some((o) => h === o || h.endsWith(`.${o}`));
}

export const BRAND_RE = /binance|\bbnb|bnb(?=[^a-z]|$)/i;
export const TRADING_RE = rx(word(alt("swap", "trade", "trading", "buy", "sell", seq("limit", "order"), seq("market", "order"), seq("prediction", "market"), "leverage", "perp(?:etual)?s?")), "i");
export const RISK_WARNING_RE = rx(String.raw`\b(?:risk|not\s+financial\s+advice|may\s+lose|could\s+lose|losses?|volatil)`, "i");
