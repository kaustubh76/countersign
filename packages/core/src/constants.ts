import type { Address } from "viem";

export const BSC_CHAIN_ID = 56;
export const ANVIL_CHAIN_ID = 31337;

/** SPACE ID's Agent ID registry ("HandleRegistry") on BSC mainnet. Same-name stale copies exist; use only this one. */
export const AGENT_ID_BSC: Address = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";

/** Domain tag prepended to the content-hash preimage (docs/skill-hash-spec.md). */
export const CONTENT_HASH_DOMAIN = "countersign.skill.v1";
export const MANIFEST_SCHEMA = "countersign.manifest/v1";
export const MANIFEST_FILE = "countersign.json";
export const RULESET_VERSION = "countersign.ruleset/v1";

/**
 * Red-Line rules whose failure means a skill tries to harm its user: the companion refuses to install it
 * and the verifier records a static incident (I3). The other rules (RL4, RL5, RL7, RL8) are hackathon red
 * lines an author must fix, but the companion only warns users about them.
 */
export const HARMFUL_REDLINE_RULES: readonly string[] = ["RL1", "RL2", "RL3", "RL6"];

export const FLAG_ANCHOR = 1;
export const FLAG_PULL = 2;
export const FLOW_APPROVE = 0;
export const FLOW_TRANSFER = 1;
export const KIND_COUNTERSIGN = 1;
export const KIND_REPORT = 2;

/** Mirrors the constants in SkillRegistry.sol / Countersign.sol. */
export const LIMITS = {
  targets: 16,
  permissions: 64,
  flows: 32,
  uriBytes: 512,
  txHashes: 8,
  page: 100,
} as const;

export const MAX_UINT96 = 2n ** 96n - 1n;
export const MAX_UINT256 = 2n ** 256n - 1n;

/** 48 h of BSC blocks at 0.45 s (Fermi hardfork, Jan 2026): the countersign recency window. */
export const SESSION_WINDOW_BLOCKS = 384_000n;

/** Agentic Wallet built-in actions (informational in manifests; they expose no calldata to the agent). */
export const BUILTIN_ACTIONS = ["market-order", "limit-order", "send", "prediction", "defi", "x402"] as const;
export type BuiltinAction = (typeof BUILTIN_ACTIONS)[number];
