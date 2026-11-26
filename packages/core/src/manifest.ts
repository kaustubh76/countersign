import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  toFunctionSelector,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  BUILTIN_ACTIONS,
  FLAG_ANCHOR,
  FLAG_PULL,
  FLOW_APPROVE,
  FLOW_TRANSFER,
  LIMITS,
  MANIFEST_SCHEMA,
  MAX_UINT256,
  MAX_UINT96,
} from "./constants.js";

/**
 * countersign.json is the permission manifest an author ships inside the skill folder, so the content
 * hash covers it. docs/manifest-spec.md documents the JSON. This module turns it into the exact arrays
 * SkillRegistry.register() takes; their ABI encoding defines manifestHash.
 */

export interface ManifestTargetJson {
  address: string;
  label?: string;
  /** EIP-1967 implementation the proxy is expected to run; omit or null if `address` is not a proxy. */
  impl?: string | null;
  /** Max native value per call, in wei, as a decimal string. Default "0". */
  maxValueWei?: string;
  /** Author-owned contract. A countersign must cite a tx to an endorsed anchor. */
  anchor?: boolean;
  /** May pull the user's tokens under a declared approve flow (an escrow, say). */
  pull?: boolean;
  /** Callable functions: signatures like "deposit(uint256)" or 4-byte selectors like "0xb6b55f25". */
  functions: string[];
}

export interface ManifestFlowJson {
  kind: "approve" | "transfer";
  /** Token address, or "native" for BNB (transfers only). */
  token: string;
  /** Spender (approve) or recipient (transfer). */
  counterparty: string;
  /** Maximum amount in the token's base units, as a decimal string. Unlimited is not allowed. */
  cap: string;
  label?: string;
}

export interface ManifestJson {
  schema: string;
  chainId: number;
  /** The author's Agent ID wallet. The version is canonical only if this address registered it. */
  publisher: string;
  name?: string;
  targets: ManifestTargetJson[];
  flows?: ManifestFlowJson[];
  builtins?: string[];
}

export interface TargetIn {
  target: Address;
  impl: Address;
  maxValue: bigint;
  flags: number;
}
export interface Permission {
  targetIndex: number;
  selector: Hex;
}
export interface Flow {
  token: Address;
  counterparty: Address;
  kind: number;
  cap: bigint;
}
export interface OnchainManifest {
  targets: TargetIn[];
  permissions: Permission[];
  flows: Flow[];
}

export interface ParsedManifest {
  chainId: number;
  publisher: Address;
  name: string | undefined;
  builtins: string[];
  onchain: OnchainManifest;
  manifestHash: Hex;
  /** Human labels by target address (lowercase), for messages. */
  labels: Record<string, string>;
}

export class ManifestError extends Error {
  override name = "ManifestError";
  constructor(readonly problems: string[]) {
    super(`invalid countersign.json:\n  - ${problems.join("\n  - ")}`);
  }
}

const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;
const SIGNATURE_RE = /^[A-Za-z_$][A-Za-z0-9_$]*\(.*\)$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/;

const MANIFEST_ABI = [
  {
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "impl", type: "address" },
      { name: "maxValue", type: "uint96" },
      { name: "flags", type: "uint8" },
    ],
  },
  {
    type: "tuple[]",
    components: [
      { name: "targetIndex", type: "uint8" },
      { name: "selector", type: "bytes4" },
    ],
  },
  {
    type: "tuple[]",
    components: [
      { name: "token", type: "address" },
      { name: "counterparty", type: "address" },
      { name: "kind", type: "uint8" },
      { name: "cap", type: "uint256" },
    ],
  },
] as const;

/** keccak256(abi.encode(targets, permissions, flows)), byte for byte what SkillRegistry computes. */
export function manifestHash(m: OnchainManifest): Hex {
  return keccak256(encodeAbiParameters(MANIFEST_ABI, [m.targets, m.permissions, m.flows]));
}

/** keccak256(abi.encode(contentHash, manifestHash, registrantAgentId)), as in SkillRegistry.register(). */
export function computeVersionId(contentHash: Hex, manifestHashValue: Hex, registrantAgentId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
      [contentHash, manifestHashValue, registrantAgentId],
    ),
  );
}

/** Agent ID tokenId for a handle (without the ".ai" suffix): uint256(keccak256(bytes(handle))). */
export function agentIdOfHandle(handle: string): bigint {
  const bare = handle.endsWith(".ai") ? handle.slice(0, -3) : handle;
  return BigInt(keccak256(toBytes(bare)));
}

export function selectorOf(fn: string): Hex {
  const trimmed = fn.trim();
  if (SELECTOR_RE.test(trimmed)) return trimmed.toLowerCase() as Hex;
  if (SIGNATURE_RE.test(trimmed)) return toFunctionSelector(trimmed.replace(/\s+/g, ""));
  throw new Error(`not a selector or function signature: ${JSON.stringify(fn)}`);
}

function asAddress(value: unknown, where: string, problems: string[]): Address | undefined {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    problems.push(`${where}: not an address (${JSON.stringify(value)})`);
    return undefined;
  }
  return getAddress(value);
}

function asUint(value: unknown, max: bigint, where: string, problems: string[], fallback?: bigint): bigint | undefined {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    problems.push(`${where}: expected a decimal string (got ${JSON.stringify(value)})`);
    return undefined;
  }
  const n = BigInt(value);
  if (n > max) {
    problems.push(`${where}: ${value} exceeds the maximum ${max}`);
    return undefined;
  }
  return n;
}

/** Validate a countersign.json object (already JSON-parsed) and derive its on-chain form. */
export function parseManifest(input: unknown): ParsedManifest {
  const problems: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ManifestError(["not a JSON object"]);
  const m = input as Partial<ManifestJson>;

  if (m.schema !== MANIFEST_SCHEMA) problems.push(`schema must be "${MANIFEST_SCHEMA}"`);
  if (typeof m.chainId !== "number" || !Number.isInteger(m.chainId) || m.chainId <= 0) problems.push("chainId must be a positive integer");
  const publisher = asAddress(m.publisher, "publisher", problems);
  if (publisher === zeroAddress) problems.push("publisher: zero address");

  const targets: TargetIn[] = [];
  const permissions: Permission[] = [];
  const labels: Record<string, string> = {};
  const targetsJson = Array.isArray(m.targets) ? m.targets : [];
  if (!Array.isArray(m.targets) || targetsJson.length === 0) problems.push("targets: at least one target is required");
  if (targetsJson.length > LIMITS.targets) problems.push(`targets: at most ${LIMITS.targets}`);
  const seenTargets = new Set<string>();

  targetsJson.forEach((t, i) => {
    const where = `targets[${i}]`;
    const target = asAddress(t?.address, `${where}.address`, problems);
    if (target) {
      if (target === zeroAddress) problems.push(`${where}.address: zero address`);
      if (seenTargets.has(target)) problems.push(`${where}.address: duplicate target ${target}`);
      seenTargets.add(target);
      if (typeof t.label === "string" && t.label.trim()) labels[target.toLowerCase()] = t.label.trim();
    }
    const impl = t?.impl == null ? zeroAddress : asAddress(t.impl, `${where}.impl`, problems);
    const maxValue = asUint(t?.maxValueWei, MAX_UINT96, `${where}.maxValueWei`, problems, 0n);
    if (t?.anchor !== undefined && typeof t.anchor !== "boolean") problems.push(`${where}.anchor must be a boolean`);
    if (t?.pull !== undefined && typeof t.pull !== "boolean") problems.push(`${where}.pull must be a boolean`);
    const flags = (t?.anchor ? FLAG_ANCHOR : 0) | (t?.pull ? FLAG_PULL : 0);
    if (target && impl !== undefined && maxValue !== undefined) targets.push({ target, impl, maxValue, flags });

    const fns = Array.isArray(t?.functions) ? t.functions : [];
    if (!Array.isArray(t?.functions) || fns.length === 0) problems.push(`${where}.functions: list at least one function`);
    const seenSelectors = new Set<string>();
    for (const fn of fns) {
      try {
        const selector = selectorOf(String(fn));
        if (seenSelectors.has(selector)) {
          problems.push(`${where}.functions: duplicate selector ${selector} (${fn})`);
          continue;
        }
        seenSelectors.add(selector);
        permissions.push({ targetIndex: i, selector });
      } catch (e) {
        problems.push(`${where}.functions: ${(e as Error).message}`);
      }
    }
  });
  if (permissions.length > LIMITS.permissions) problems.push(`functions: at most ${LIMITS.permissions} in total`);

  const flows: Flow[] = [];
  const flowsJson = m.flows === undefined ? [] : Array.isArray(m.flows) ? m.flows : null;
  if (flowsJson === null) problems.push("flows must be an array");
  if ((flowsJson?.length ?? 0) > LIMITS.flows) problems.push(`flows: at most ${LIMITS.flows}`);
  (flowsJson ?? []).forEach((f, i) => {
    const where = `flows[${i}]`;
    const kind = f?.kind === "approve" ? FLOW_APPROVE : f?.kind === "transfer" ? FLOW_TRANSFER : undefined;
    if (kind === undefined) problems.push(`${where}.kind must be "approve" or "transfer"`);
    const native = f?.token === "native";
    if (native && kind === FLOW_APPROVE) problems.push(`${where}: native BNB cannot be approved`);
    const token = native ? zeroAddress : asAddress(f?.token, `${where}.token`, problems);
    const counterparty = asAddress(f?.counterparty, `${where}.counterparty`, problems);
    if (counterparty === zeroAddress) problems.push(`${where}.counterparty: zero address`);
    const cap = asUint(f?.cap, MAX_UINT256 - 1n, `${where}.cap`, problems);
    if (typeof f?.cap === "string" && f.cap === MAX_UINT256.toString()) problems.push(`${where}.cap: unlimited caps are not allowed`);
    if (kind !== undefined && token !== undefined && counterparty !== undefined && cap !== undefined) {
      flows.push({ token, counterparty, kind, cap });
    }
  });

  const builtins = Array.isArray(m.builtins) ? m.builtins.map(String) : [];
  for (const b of builtins) {
    if (!(BUILTIN_ACTIONS as readonly string[]).includes(b)) problems.push(`builtins: unknown action "${b}"`);
  }

  if (problems.length > 0 || !publisher) throw new ManifestError(problems.length ? problems : ["publisher missing"]);
  const onchain = { targets, permissions, flows };
  return {
    chainId: m.chainId as number,
    publisher,
    name: typeof m.name === "string" ? m.name : undefined,
    builtins,
    onchain,
    manifestHash: manifestHash(onchain),
    labels,
  };
}
