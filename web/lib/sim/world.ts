import { encodeAbiParameters, keccak256, pad, toHex, zeroAddress, type Address, type Hash, type Hex, type Transaction, type TransactionReceipt } from "viem";
import {
  FLAG_ANCHOR,
  hashSkillFiles,
  KIND_COUNTERSIGN,
  parseManifest,
  selectorOf,
  TOPIC_APPROVAL,
  TOPIC_TRANSFER,
  type ManifestJson,
  type RecordView,
  type SkillFile,
  type TxSource,
  type VersionView,
} from "@countersign/core/browser";

/**
 * A small, fully simulated BNB Smart Chain world for the "Try to fake it" playground. Every actor,
 * address and transaction here is fictional. The verifier that judges them is the real one
 * (countersign.ruleset/v1 from @countersign/core), unchanged.
 */

export const SIM_CHAIN_ID = 56;
export const BLOCK_SECONDS = 0.45;
/** "Now" on the simulated chain, and when the demo skill version was registered (about 25 h earlier). */
export const NOW = 135_400_000n;
export const REGISTERED = NOW - 200_000n;

const A = (hex: string) => `0x${hex.toLowerCase().padStart(40, "0")}` as Address;

export type ActorKey = "author" | "you" | "friend" | "rival" | "peer" | "bot";
export interface Actor {
  key: ActorKey;
  name: string;
  role: string;
  address: Address;
  agentId: bigint | null;
}

export const ACTORS: Record<ActorKey, Actor> = {
  author: { key: "author", name: "The author", role: "published dca-planner · Agent ID #1", address: A("a11ce"), agentId: 1n },
  you: { key: "you", name: "You", role: "a real user · Agent ID #2", address: A("b0b"), agentId: 2n },
  friend: { key: "friend", name: "A friend", role: "never used the skill · Agent ID #3", address: A("f00d"), agentId: 3n },
  rival: { key: "rival", name: "A rival author", role: "a competitor · Agent ID #6", address: A("badbad0"), agentId: 6n },
  peer: { key: "peer", name: "Another author", role: "publishes a different skill · Agent ID #7", address: A("a0bee"), agentId: 7n },
  bot: { key: "bot", name: "Bot wallet #417", role: "one of 1,000 fresh wallets · no Agent ID", address: A("b07417"), agentId: null },
};

export const CONTRACTS = {
  vault: A("dca0a99"),
  token: A("70ce"),
  nft: A("1f7"),
  impl: A("1111"),
  evilImpl: A("e711"),
  stranger: A("5eed"),
};

export const LABELS: Record<string, string> = {
  [CONTRACTS.vault]: "author's vault",
  [CONTRACTS.token]: "shared token",
  [CONTRACTS.nft]: "NFT mint",
  [CONTRACTS.stranger]: "stranger",
  [CONTRACTS.impl]: "declared code",
  [CONTRACTS.evilImpl]: "new code",
  ...Object.fromEntries(Object.values(ACTORS).map((a) => [a.address, a.name])),
};
export const labelOf = (a: string) => LABELS[a.toLowerCase()] ?? `${a.slice(0, 6)}…${a.slice(-4)}`;

export const CODE: Record<string, Hex> = {
  [CONTRACTS.vault]: "0x60806040526004361061001e",
  [CONTRACTS.token]: "0x60806040526004361061002f",
  [CONTRACTS.nft]: "0x608060405260043610610040",
};

export const FN = {
  deposit: selectorOf("deposit(uint256)"),
  withdraw: selectorOf("withdraw(uint256)"),
  approve: selectorOf("approve(address,uint256)"),
  transfer: selectorOf("transfer(address,uint256)"),
  transferFrom: selectorOf("transferFrom(address,address,uint256)"),
  mint: selectorOf("mint()"),
  rebalance: selectorOf("rebalanceAll()"),
};
export const FN_NAMES: Record<string, string> = {
  [FN.deposit]: "deposit(amount)",
  [FN.withdraw]: "withdraw(amount)",
  [FN.approve]: "approve(spender, amount)",
  [FN.transfer]: "transfer(to, amount)",
  [FN.transferFrom]: "transferFrom(from, to, amount)",
  [FN.mint]: "mint()",
  [FN.rebalance]: "rebalanceAll()",
};

export const UNIT = 10n ** 18n;
export const CAP = 100n * UNIT;
export const MAX_UINT = 2n ** 256n - 1n;

// ── the demo skill version (its countersign.json is part of the hashed content) ───────────────────

export function manifestJson(opts: { proxy?: boolean } = {}): ManifestJson {
  return {
    schema: "countersign.manifest/v1",
    chainId: SIM_CHAIN_ID,
    publisher: ACTORS.author.address,
    name: "dca-planner",
    targets: [
      {
        address: CONTRACTS.vault,
        label: "dca-planner vault",
        anchor: true,
        ...(opts.proxy ? { impl: CONTRACTS.impl } : {}),
        functions: ["deposit(uint256)", "withdraw(uint256)"],
      },
      { address: CONTRACTS.token, label: "USD stablecoin", functions: ["approve(address,uint256)"] },
    ],
    flows: [{ kind: "approve", token: CONTRACTS.token, counterparty: CONTRACTS.vault, cap: CAP.toString(), label: "stablecoin to the vault" }],
  };
}

const enc = new TextEncoder();
export function skillFiles(opts: { proxy?: boolean; extraInstruction?: string } = {}): SkillFile[] {
  const skill =
    `---\nname: dca-planner\ndescription: Weekly buys from a vault, capped and declared.\n---\n\n` +
    `Deposits into the dca-planner vault on a schedule you choose.\n` +
    (opts.extraInstruction ? `${opts.extraInstruction}\n` : "") +
    `\nRisk warning: trading crypto carries risk of loss. Nothing here is financial advice.\n`;
  return [
    { path: "SKILL.md", bytes: enc.encode(skill) },
    { path: "countersign.json", bytes: enc.encode(JSON.stringify(manifestJson(opts), null, 2)) },
  ];
}

/** Build the on-chain VersionView the registry would hold for this content, registered by `registrant`. */
export function versionFor(files: SkillFile[], opts: { proxy?: boolean; registrant?: Actor; versionSalt?: string } = {}): VersionView {
  const registrant = opts.registrant ?? ACTORS.author;
  const manifestFile = files.find((f) => f.path === "countersign.json");
  const parsed = parseManifest(JSON.parse(new TextDecoder().decode(manifestFile!.bytes)));
  const { contentHash } = hashSkillFiles(files);
  return {
    versionId: keccak256(toHex(`sim-version:${contentHash}:${registrant.agentId}:${opts.versionSalt ?? ""}`)),
    contentHash,
    manifestHash: parsed.manifestHash,
    registrantAgentId: registrant.agentId ?? 0n,
    registrant: registrant.address,
    registeredBlock: REGISTERED,
    registeredAt: 0n,
    contentURI: "https://github.com/example/dca-planner/tree/0d1c2b3/skill",
    targets: parsed.onchain.targets.map((t) => ({
      target: t.target,
      maxValue: t.maxValue,
      impl: t.impl,
      flags: t.flags,
      // anchors whose owner() is the registrant are auto-endorsed at registration
      endorser: (t.flags & FLAG_ANCHOR) !== 0 && registrant.key === "author" ? registrant.address : zeroAddress,
      codehash: keccak256(CODE[t.target.toLowerCase()] ?? "0x"),
    })),
    permissions: parsed.onchain.permissions,
    flows: parsed.onchain.flows,
    attestation: null,
  };
}

// ── simulated chain ──────────────────────────────────────────────────────────────────────────────

export interface SimLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}
export interface SimTx {
  hash: Hash;
  from: Address;
  to: Address;
  input: Hex;
  value: bigint;
  block: bigint;
  status: "success" | "reverted";
  chainId: number;
  logs: SimLog[];
  /** Plain-English effects, for display only (the verifier reads `logs`). */
  effects: string[];
}

export const topic = (a: Address) => pad(a, { size: 32 }).toLowerCase() as Hex;
export const amount = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n]);

export class SimChain implements TxSource {
  readonly txs = new Map<string, SimTx>();
  readonly code = new Map<string, Hex>(Object.entries(CODE));
  readonly storage = new Map<string, Hex>();
  private n = 0;
  constructor(private readonly seed = "sim") {}

  add(t: Partial<SimTx> & { from: Address; to: Address }): SimTx {
    const tx: SimTx = {
      hash: keccak256(toHex(`${this.seed}-tx-${++this.n}`)),
      input: FN.deposit,
      value: 0n,
      block: NOW - 1_800n,
      status: "success",
      chainId: SIM_CHAIN_ID,
      logs: [],
      effects: [],
      ...t,
    };
    this.txs.set(tx.hash, tx);
    return tx;
  }

  setImpl(proxy: Address, impl: Address) {
    this.storage.set(`${proxy.toLowerCase()}:0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`, pad(impl, { size: 32 }));
  }

  async getTransaction(hash: Hash): Promise<Transaction | null> {
    const t = this.txs.get(hash);
    if (!t) return null;
    return { hash, from: t.from, to: t.to, input: t.input, value: t.value, blockNumber: t.block, chainId: t.chainId } as unknown as Transaction;
  }
  async getReceipt(hash: Hash): Promise<TransactionReceipt | null> {
    const t = this.txs.get(hash);
    if (!t) return null;
    return { status: t.status, logs: t.logs } as unknown as TransactionReceipt;
  }
  async getCode(a: Address): Promise<Hex | undefined> {
    return this.code.get(a.toLowerCase()) ?? "0x";
  }
  async getStorageAt(a: Address, slot: Hex): Promise<Hex | undefined> {
    return this.storage.get(`${a.toLowerCase()}:${slot}`) ?? pad("0x0", { size: 32 });
  }
}

// ── common transactions ──────────────────────────────────────────────────────────────────────────

/** An approval of the stablecoin to `spender`, emitted by the token. */
export function approveTx(chain: SimChain, from: Actor, spender: Address, value: bigint, block?: bigint): SimTx {
  const shown = value === MAX_UINT ? "unlimited" : `${value / UNIT} USD`;
  return chain.add({
    from: from.address,
    to: CONTRACTS.token,
    input: (FN.approve + spender.slice(2).padStart(64, "0") + value.toString(16).padStart(64, "0")) as Hex,
    block,
    logs: [{ address: CONTRACTS.token, topics: [TOPIC_APPROVAL, topic(from.address), topic(spender)], data: amount(value) }],
    effects: [`approve ${shown} → ${labelOf(spender)}`],
  });
}

/** A deposit into the author's vault, which pulls the approved stablecoin. */
export function depositTx(chain: SimChain, from: Actor, value: bigint, block?: bigint): SimTx {
  return chain.add({
    from: from.address,
    to: CONTRACTS.vault,
    input: FN.deposit,
    block,
    logs: [{ address: CONTRACTS.token, topics: [TOPIC_TRANSFER, topic(from.address), topic(CONTRACTS.vault)], data: amount(value) }],
    effects: [`deposit ${value / UNIT} USD`],
  });
}

export function record(signer: Actor, versionId: Hex, txHashes: Hex[], kind = KIND_COUNTERSIGN, block = NOW): RecordView {
  return { versionId, agentId: signer.agentId ?? 0n, signer: signer.address, blockNumber: block, kind, txHashes };
}

/** "3 min ago" style label for a simulated block. */
export function ago(block: bigint, now = NOW): string {
  const s = Number(now - block) * BLOCK_SECONDS;
  if (s < 0) return "in the future";
  if (s < 90) return `${Math.round(s)} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172_800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} days ago`;
}
