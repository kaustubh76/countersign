/**
 * Fetching verified source for RL4 (`@countersign/redline/sources`). Isomorphic (only `fetch`), with the
 * chain reads injected, so it runs in the CLI and on the server alike.
 *
 * Precedence is fixed so a re-run reads the same files: a local file (anvil only), then Sourcify, then
 * Etherscan V2 only with a paid key (since late 2025 Etherscan's free tier does not cover BNB Chain).
 * A Sourcify miss is not proof of "unverified": BscScan may still have it. So without an Etherscan
 * answer the status is "unavailable" (RL4 not checked), never a failure.
 */
import { getAddress, keccak256, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { analyzeSources, markRenounced, type AbiFunction, type OwnerPower, type SourceAnalysis } from "./owner.js";

export type SourceStatus = "verified" | "unverified" | "unavailable" | "no-code";
export type SourceProvider = "sourcify" | "etherscan" | "local";

export interface ProxyInfo {
  kind: "eip1967" | "beacon" | "clone";
  implementation: Address | null;
}

/** One contract as RL4 sees it. Everything here goes into the report, so it holds no time-varying fields. */
export interface AnalyzedContract {
  address: Address;
  status: SourceStatus;
  provider?: SourceProvider;
  contractName?: string | null;
  /** keccak256 of the sorted verified files: which source this analysis read. */
  sourceHash?: Hex;
  codehash?: Hex;
  /** owner() if the contract has one; the zero address means ownership was renounced. */
  owner?: Address | null;
  proxy?: ProxyInfo;
  /** For proxies and clones: the code that actually runs. */
  implementation?: AnalyzedContract;
  powers: OwnerPower[];
  others: string[];
  /** Why it is unavailable or undetermined. */
  detail?: string;
}

export interface LocalSource {
  /** path → content */
  files: Record<string, string>;
  contractName?: string;
}

export interface FetchSourcesOptions {
  chainId: number;
  getCode: (address: Address) => Promise<Hex | undefined>;
  getStorageAt?: (address: Address, slot: Hex) => Promise<Hex | undefined>;
  /** owner() via eth_call; null when the contract has none. */
  readOwner?: (address: Address) => Promise<Address | null>;
  /** A paid Etherscan API key; without one BscScan is not consulted. */
  etherscanKey?: string;
  /** Sources for local chains (31337 only): address (any case) → files. */
  localSources?: Record<string, LocalSource>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sourcifyBase?: string;
}

export const SOURCIFY_BASE = "https://sourcify.dev/server";
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as Hex;
const CLONE_RE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i;
const LOCAL_CHAINS = new Set([31337, 1337]);

interface Verified {
  provider: SourceProvider;
  files: Record<string, string>;
  contractName: string | null;
  abi: AbiFunction[] | null;
  language: string | null;
}
type Lookup = { kind: "verified"; v: Verified } | { kind: "unverified" } | { kind: "missing"; detail: string } | { kind: "error"; detail: string };

/** keccak256 of the files as [path, content] pairs sorted by path (raw content, so it pins exact bytes). */
export function sourceHashOf(files: Record<string, string>): Hex {
  const pairs = Object.keys(files)
    .sort()
    .map((p) => [p, files[p] ?? ""]);
  return keccak256(toBytes(JSON.stringify(pairs)));
}

function slotAddress(word: Hex | undefined): Address | null {
  if (!word || word === "0x") return null;
  const hex = word.slice(2).padStart(64, "0").slice(-40);
  const a = getAddress(`0x${hex}`);
  return a === zeroAddress ? null : a;
}

async function get(url: string, opts: FetchSourcesOptions): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  return f(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), headers: { accept: "application/json" } });
}

async function fromSourcify(address: Address, opts: FetchSourcesOptions): Promise<Lookup> {
  const base = (opts.sourcifyBase ?? SOURCIFY_BASE).replace(/\/$/, "");
  try {
    const res = await get(`${base}/v2/contract/${opts.chainId}/${address.toLowerCase()}?fields=sources,compilation,abi`, opts);
    if (res.status === 404) return { kind: "missing", detail: "not on Sourcify" };
    if (!res.ok) return { kind: "error", detail: `Sourcify answered ${res.status}` };
    const j = (await res.json()) as {
      match?: string | null;
      sources?: Record<string, { content?: string }>;
      compilation?: { name?: string; language?: string };
      abi?: AbiFunction[];
    };
    if (!j.match || !j.sources) return { kind: "missing", detail: "not on Sourcify" };
    const files: Record<string, string> = {};
    for (const [path, f] of Object.entries(j.sources)) files[path] = f.content ?? "";
    return {
      kind: "verified",
      v: { provider: "sourcify", files, contractName: j.compilation?.name ?? null, abi: j.abi ?? null, language: j.compilation?.language ?? null },
    };
  } catch (e) {
    return { kind: "error", detail: `Sourcify unreachable: ${(e as Error).message}` };
  }
}

/** Etherscan's SourceCode comes flat, as `{{standard-json}}`, or as `{path: {content}}`. */
export function parseEtherscanSource(sourceCode: string, contractName: string): Record<string, string> {
  const t = sourceCode.trim();
  if (t.startsWith("{")) {
    try {
      const json = JSON.parse(t.startsWith("{{") ? t.slice(1, -1) : t) as Record<string, unknown>;
      const sources = (json.sources ?? json) as Record<string, { content?: string }>;
      const files: Record<string, string> = {};
      for (const [path, f] of Object.entries(sources)) if (f && typeof f.content === "string") files[path] = f.content;
      if (Object.keys(files).length) return files;
    } catch {
      // not JSON after all: a flat file that starts with a brace
    }
  }
  return { [`${contractName || "Contract"}.sol`]: sourceCode };
}

async function fromEtherscan(address: Address, opts: FetchSourcesOptions): Promise<Lookup> {
  const key = opts.etherscanKey;
  if (!key) return { kind: "missing", detail: "BscScan not consulted (needs a paid Etherscan API key)" };
  try {
    const url = `${ETHERSCAN_V2}?chainid=${opts.chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${encodeURIComponent(key)}`;
    const res = await get(url, opts);
    if (!res.ok) return { kind: "error", detail: `Etherscan answered ${res.status}` };
    const j = (await res.json()) as { status?: string; message?: string; result?: unknown };
    // status "0" is an error (rate limit, bad key, chain not on the plan), never an answer about the contract
    if (j.status !== "1" || !Array.isArray(j.result) || !j.result[0]) return { kind: "error", detail: `Etherscan: ${String(j.result ?? j.message ?? "error").slice(0, 120)}` };
    const r = j.result[0] as { SourceCode?: string; ContractName?: string; ABI?: string; CompilerVersion?: string };
    if (!r.SourceCode) return { kind: "unverified" };
    let abi: AbiFunction[] | null = null;
    try {
      abi = JSON.parse(r.ABI ?? "null") as AbiFunction[] | null;
    } catch {
      abi = null;
    }
    return {
      kind: "verified",
      v: {
        provider: "etherscan",
        files: parseEtherscanSource(r.SourceCode, r.ContractName ?? ""),
        contractName: r.ContractName || null,
        abi,
        language: /vyper/i.test(r.CompilerVersion ?? "") ? "Vyper" : "Solidity",
      },
    };
  } catch (e) {
    return { kind: "error", detail: `Etherscan unreachable: ${(e as Error).message}` };
  }
}

async function lookup(address: Address, opts: FetchSourcesOptions): Promise<Lookup> {
  const local = opts.localSources
    ? Object.entries(opts.localSources).find(([a]) => a.toLowerCase() === address.toLowerCase())?.[1]
    : undefined;
  if (local) {
    if (!LOCAL_CHAINS.has(opts.chainId)) return { kind: "error", detail: "local sources are only accepted on a local chain" };
    return { kind: "verified", v: { provider: "local", files: local.files, contractName: local.contractName ?? null, abi: null, language: "Solidity" } };
  }
  if (LOCAL_CHAINS.has(opts.chainId)) return { kind: "missing", detail: "no verified-source service for a local chain (pass a local source)" };
  const s = await fromSourcify(address, opts);
  if (s.kind === "verified") return s;
  const e = await fromEtherscan(address, opts);
  if (e.kind === "verified" || e.kind === "unverified") return e;
  const detail = [s, e].map((x) => (x.kind === "missing" || x.kind === "error" ? x.detail : "")).filter(Boolean).join("; ");
  return { kind: s.kind === "error" || e.kind === "error" ? "error" : "missing", detail };
}

function withAnalysis(base: Omit<AnalyzedContract, "powers" | "others">, analysis: SourceAnalysis): AnalyzedContract {
  return {
    ...base,
    contractName: analysis.contractName ?? base.contractName ?? null,
    powers: analysis.powers,
    others: analysis.others,
    ...(analysis.undetermined ? { status: "unavailable" as const, detail: analysis.undetermined } : {}),
  };
}

async function analyzeOne(address: Address, opts: FetchSourcesOptions, depth: number): Promise<AnalyzedContract> {
  const a = getAddress(address);
  let code: Hex | undefined;
  try {
    code = await opts.getCode(a);
  } catch (e) {
    return { address: a, status: "unavailable", powers: [], others: [], detail: `could not read code: ${(e as Error).message.split("\n")[0]}` };
  }
  if (!code || code === "0x") return { address: a, status: "no-code", powers: [], others: [], detail: `no contract code on chain ${opts.chainId}` };
  const codehash = keccak256(code);

  // proxies: what runs is the implementation, and the proxy's admin can swap it
  let proxy: ProxyInfo | undefined;
  const clone = CLONE_RE.exec(code);
  if (clone) proxy = { kind: "clone", implementation: getAddress(`0x${clone[1]}`) };
  else if (opts.getStorageAt) {
    const impl = slotAddress(await opts.getStorageAt(a, IMPL_SLOT).catch(() => undefined));
    const beacon = impl ? null : slotAddress(await opts.getStorageAt(a, BEACON_SLOT).catch(() => undefined));
    if (impl) proxy = { kind: "eip1967", implementation: impl };
    else if (beacon) proxy = { kind: "beacon", implementation: null };
  }

  let owner: Address | null | undefined;
  if (opts.readOwner) owner = await opts.readOwner(a).catch(() => null);

  const found = await lookup(a, opts);
  const base = { address: a, codehash, ...(owner !== undefined ? { owner } : {}), ...(proxy ? { proxy } : {}) };
  let result: AnalyzedContract;
  if (found.kind === "verified") {
    const analysis = analyzeSources({ sources: found.v.files, contractName: found.v.contractName, abi: found.v.abi, language: found.v.language });
    result = withAnalysis({ ...base, status: "verified", provider: found.v.provider, contractName: found.v.contractName, sourceHash: sourceHashOf(found.v.files) }, analysis);
    if (owner === zeroAddress) result.powers = markRenounced(result.powers);
  } else if (found.kind === "unverified") {
    result = { ...base, status: "unverified", provider: "etherscan", powers: [], others: [], detail: "source is not verified on BscScan" };
  } else {
    result = { ...base, status: "unavailable", powers: [], others: [], detail: found.detail };
  }

  if (proxy) {
    if (proxy.kind !== "clone") {
      result.powers = [...result.powers, { category: "upgrade", fn: "(proxy admin)", guard: proxy.kind === "beacon" ? "beacon owner" : "proxy admin" }];
    }
    if (proxy.implementation && depth === 0) result.implementation = await analyzeOne(proxy.implementation, opts, 1);
    else if (!proxy.implementation) {
      result.status = result.status === "verified" ? "unavailable" : result.status;
      result.detail = "beacon proxy: the implementation was not resolved";
    }
  }
  return result;
}

/** Analyse each contract (in parallel). Never throws: problems become statuses. */
export async function analyzeContracts(addresses: readonly Address[], opts: FetchSourcesOptions): Promise<AnalyzedContract[]> {
  const unique = [...new Map(addresses.map((a) => [a.toLowerCase(), a])).values()];
  return Promise.all(unique.map((a) => analyzeOne(a, opts, 0)));
}
