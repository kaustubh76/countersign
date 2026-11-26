/**
 * Red-Line Check rules (ruleset countersign.redline/v1). Static and deterministic: the same files always
 * give the same findings, so anyone can re-run a check and compare the report hash.
 *
 * The rules look for instructions and requests, not for topics. A skill that says it *never* does
 * something is not flagged for mentioning it. Patterns are written with \s+ between words, so the literal
 * phrases they detect do not appear in this repository.
 *
 * Rule ids follow the hackathon's red-line numbers. RL4 (owner permissions in verified source) is not in
 * v1, and RL9 does not apply to skill files.
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
  RL1: "No pairing-code or QR login outside the Binance App",
  RL2: "No prompts that bypass user confirmation of asset actions",
  RL3: "No unlimited approvals or undeclared transfer recipients",
  RL5: "No Binance / BNB branding in skill names or domains",
  RL6: "No collection of wallet secrets",
  RL7: "No promised returns",
  RL8: "Risk warning when the skill trades (advisory)",
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
}

const W = String.raw`[\s\-]*`; // optional word joiner ("auto-sign", "auto sign", "autosign")

export const TEXT_PATTERNS: TextPattern[] = [
  // RL1: login flows that move pairing outside the official App confirmation
  {
    rule: "RL1",
    severity: "fail",
    negatable: true,
    re: /\b(?:enter|paste|type|input|submit|send|share|give)\s+(?:(?:me|us|it|the|your|this)\s+){0,2}(?:6[\s-]*(?:character|char|digit)\s+)?pairing\s+code\b/gi,
    message: "asks the user to hand over or type a pairing code (pairing is confirmed only inside the Binance App)",
  },
  {
    rule: "RL1",
    severity: "fail",
    negatable: true,
    re: /\bscan\s+(?:the|this|our)\s+qr\s*code\s+(?:on|at|from)\s+(?:our|this|the)\s+(?:site|website|page|dashboard)\b/gi,
    message: "web-based QR login",
  },

  // RL2: confirmation bypass
  {
    rule: "RL2",
    severity: "fail",
    negatable: false,
    re: /\bno\s+need\s+to\s+(?:ask|confirm|wait|check\s+with)\b/gi,
    message: "tells the agent confirmation is unnecessary",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: /\b(?:skip|bypass|disable|avoid|omit|suppress)\s+(?:the\s+|any\s+|all\s+|user\s+|every\s+)*(?:confirmation|confirmations|confirm\s+step|approval\s+prompt|user\s+approval|preview)\b/gi,
    message: "instructs the agent to skip user confirmation",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: /\b(?:don'?t|do\s+not|never)\s+(?:ask|wait\s+for|prompt|bother)\s+(?:the\s+)?(?:user|human|owner)(?:\s+(?:for|to))?\s+(?:confirm|confirmation|approval|permission)\b/gi,
    message: "instructs the agent not to ask the user for confirmation",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: new RegExp(String.raw`\b(?:use|enable|turn\s+on|rely\s+on|with)\s+(?:the\s+)?secure${W}auto${W}sign\b`, "gi"),
    message: "steers the user to auto-signing so actions execute without per-transaction confirmation",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: new RegExp(String.raw`\bauto${W}(?:confirm|approve|sign|execute)(?:s|d|ing)?\b`, "gi"),
    message: "auto-confirms / auto-signs asset actions",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: /\b(?:silently|quietly|automatically)\s+(?:approve|sign|execute|send|transfer|confirm|swap)\b/gi,
    message: "performs asset actions without the user seeing them",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: /\b(?:execute|broadcast|send)\s+(?:it\s+|the\s+transaction\s+|immediately\s+|directly\s+|right\s+away\s+)*without\s+(?:asking|confirmation|confirming|showing|telling|waiting)\b/gi,
    message: "executes without showing or confirming",
  },
  {
    rule: "RL2",
    severity: "fail",
    negatable: true,
    re: /\b(?:hide|don'?t\s+show|do\s+not\s+show|never\s+show)\s+(?:the\s+)?(?:transaction|tx|preview|details|amount|recipient|approval)\b/gi,
    message: "hides transaction details from the user",
  },

  // RL3: unlimited approvals and unattended transfers
  {
    rule: "RL3",
    severity: "fail",
    negatable: true,
    re: /\b(?:unlimited|infinite|max(?:imum)?)\s+(?:token\s+)?(?:approval|allowance)s?\b/gi,
    message: "solicits an unlimited approval",
  },
  {
    rule: "RL3",
    severity: "fail",
    negatable: false,
    re: /\b(?:MaxUint256|maxUint256|MAX_UINT256|MAX_UINT|type\(uint256\)\.max|constants\.MaxUint256|ethers\.MaxUint256|maxUint)\b|\b2\s*\*\*\s*256\s*-\s*1\b|\b0x[fF]{64}\b/g,
    message: "unlimited (max-uint) amount literal",
  },
  {
    rule: "RL3",
    severity: "warn",
    negatable: true,
    re: /\bsetApprovalForAll\s*\(/g,
    message: "operator approval over every NFT/1155 the user holds; make sure the manifest declares the operator",
  },
  {
    rule: "RL3",
    severity: "warn",
    negatable: true,
    re: /\b(?:setInterval|cron|schedule(?:d|r)?|every\s+\d+\s*(?:seconds?|minutes?|hours?|days?))\b[^\n]{0,80}\b(?:transfer|send|withdraw|sweep|collect)\b/gi,
    message: "scheduled or recurring transfer",
  },

  // RL6: wallet secrets (requests, and code that reads the wallet's session store)
  {
    rule: "RL6",
    severity: "fail",
    negatable: true,
    re: /\b(?:enter|paste|type|provide|send|share|give|input|reveal|export|tell\s+me|what\s+is)\s+(?:(?:me|us|it|the|your|its|this)\s+){0,2}(?:wallet\s+)?(?:seed\s*phrase|mnemonic|recovery\s+(?:phrase|words)|secret\s+(?:phrase|key|recovery)|private\s+key|api\s+secret|secret\s+key|1[28][\s-]*word)/gi,
    message: "asks for a wallet secret",
  },
  {
    rule: "RL6",
    severity: "fail",
    negatable: false,
    re: /(?:~|\$HOME|homedir\(\)|os\.homedir)[^\n]{0,40}\.baw\b|\bBINANCE_BAW_DIR\b|\bkeytar\b[^\n]{0,60}\bbaw\b/g,
    message: "reads the Agentic Wallet's session store",
  },

  // RL7: promised returns
  {
    rule: "RL7",
    severity: "fail",
    negatable: true,
    re: /\b(?:passive\s+income|guaranteed\s+(?:returns?|profits?|yield|income|gains?)|risk[\s-]*free\s+(?:returns?|profits?|income|yield)|automatic\s+money[\s-]*making|money[\s-]*making\s+machine|get\s+rich|double\s+your\s+(?:money|crypto|funds)|100\s*%\s+(?:profit|win|guaranteed))\b/gi,
    message: "promises returns",
  },
];

/** Words that, earlier in the same sentence, turn an instruction into a prohibition. */
const NEGATION_RE = /\b(?:never|not|no|don'?t|doesn'?t|won'?t|must\s+not|mustn'?t|cannot|can'?t|refuse|refuses|without\s+ever|forbid(?:den|s)?|prohibit(?:ed|s)?|rejects?|flags?|blocks?|detects?|warns?\s+(?:about|on))\b/i;

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
  "bscscan.com",
  "bnbchain.io",
] as const;

export function isOfficialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return OFFICIAL_BRAND_HOSTS.some((o) => h === o || h.endsWith(`.${o}`));
}

export const BRAND_RE = /binance|\bbnb|bnb(?=[^a-z]|$)/i;

export const TRADING_RE = /\b(?:swap|trade|trading|buy|sell|limit[\s-]+order|market[\s-]+order|prediction\s+market|leverage|perp(?:etual)?s?)\b/i;
export const RISK_WARNING_RE = /\b(?:risk|not\s+financial\s+advice|may\s+lose|could\s+lose|losses?|volatil)/i;
