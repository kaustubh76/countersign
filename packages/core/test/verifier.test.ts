import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  keccak256,
  pad,
  toHex,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import { hashSkillFiles, type SkillFile } from "../src/skillHash.js";
import { parseManifest } from "../src/manifest.js";
import {
  EIP1967_IMPL_SLOT,
  TOPIC_APPROVAL,
  TOPIC_TRANSFER,
  verifyVersionData,
  type TxSource,
  type VerifyInput,
} from "../src/verifier.js";
import type { RecordView, VersionView } from "../src/views.js";

// ── actors & contracts ─────────────────────────────────────────────────────────────────────────
const ALICE = "0x00000000000000000000000000000000000A11CE" as Address; // author (agent 1)
const BOB = "0x0000000000000000000000000000000000000B0B" as Address; // user (agent 2)
const CAROL = "0x00000000000000000000000000000000000CA201" as Address; // user (agent 3)
const DAVE = "0x000000000000000000000000000000000000DA7E" as Address; // user (agent 4)
const ERIN = "0x00000000000000000000000000000000000E21A0" as Address; // user (agent 5)
const MALLORY = "0x000000000000000000000000000000000BADBAD0" as Address; // competitor (agent 6)
const APP = "0x0000000000000000000000000000000000000A99" as Address;
const TOKEN = "0x00000000000000000000000000000000000070CE" as Address;
const ROUTER = "0x0000000000000000000000000000000000000B07" as Address;
const RANDO = "0x0000000000000000000000000000000000000123" as Address;
const IMPL = "0x0000000000000000000000000000000000001111" as Address;

const APP_CODE = "0x6080604052" as Hex;
const TOKEN_CODE = "0x6080604053" as Hex;
const PING = "0x5c36b186";
const APPROVE = "0x095ea7b3";
const TRANSFER = "0xa9059cbb";

const REGISTERED = 1_000n;

const topic = (a: Address) => pad(a, { size: 32 }).toLowerCase() as Hex;
const amount = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n]);

function version(over: Partial<VersionView> = {}): VersionView {
  return {
    versionId: keccak256(toHex("v1")),
    contentHash: keccak256(toHex("content")),
    manifestHash: keccak256(toHex("manifest")),
    registrantAgentId: 1n,
    registrant: ALICE,
    registeredBlock: REGISTERED,
    registeredAt: 0n,
    contentURI: "https://github.com/o/r/tree/abcdef0/skill",
    targets: [
      { target: APP, maxValue: 0n, impl: zeroAddress, flags: 1, endorser: ALICE, codehash: keccak256(APP_CODE) },
      { target: TOKEN, maxValue: 0n, impl: zeroAddress, flags: 0, endorser: zeroAddress, codehash: keccak256(TOKEN_CODE) },
    ],
    permissions: [
      { targetIndex: 0, selector: PING },
      { targetIndex: 1, selector: APPROVE },
      { targetIndex: 1, selector: TRANSFER },
    ],
    flows: [
      { token: TOKEN, counterparty: APP, kind: 0, cap: 100n },
      { token: TOKEN, counterparty: CAROL, kind: 1, cap: 50n },
    ],
    attestation: null,
    ...over,
  };
}

interface FakeTx {
  from: Address;
  to: Address;
  input?: Hex;
  value?: bigint;
  block: bigint;
  status?: "success" | "reverted";
  logs?: { address: Address; topics: Hex[]; data: Hex }[];
  chainId?: number;
}

class FakeChain implements TxSource {
  txs = new Map<string, FakeTx>();
  code = new Map<string, Hex>([
    [APP.toLowerCase(), APP_CODE],
    [TOKEN.toLowerCase(), TOKEN_CODE],
  ]);
  storage = new Map<string, Hex>();
  private n = 0;
  add(tx: FakeTx): Hash {
    const hash = keccak256(toHex(`tx-${++this.n}`));
    this.txs.set(hash, tx);
    return hash;
  }
  async getTransaction(hash: Hash): Promise<Transaction | null> {
    const t = this.txs.get(hash);
    if (!t) return null;
    return {
      hash,
      from: t.from,
      to: t.to,
      input: t.input ?? PING,
      value: t.value ?? 0n,
      blockNumber: t.block,
      chainId: t.chainId ?? 56,
    } as unknown as Transaction;
  }
  async getReceipt(hash: Hash): Promise<TransactionReceipt | null> {
    const t = this.txs.get(hash);
    if (!t) return null;
    return { status: t.status ?? "success", logs: t.logs ?? [] } as unknown as TransactionReceipt;
  }
  async getCode(a: Address) {
    return this.code.get(a.toLowerCase()) ?? "0x";
  }
  async getStorageAt(a: Address, slot: Hex) {
    return this.storage.get(`${a.toLowerCase()}:${slot}`) ?? pad("0x0", { size: 32 });
  }
}

const record = (signer: Address, agentId: bigint, txHashes: Hex[], block = 2_000n, kind = 1): RecordView => ({
  versionId: keccak256(toHex("v1")),
  agentId,
  signer,
  blockNumber: block,
  kind,
  txHashes,
});

const input = (over: Partial<VerifyInput> = {}): VerifyInput => ({
  chainId: 56,
  version: version(),
  countersigns: [],
  reports: [],
  graph: { countersignedAuthors: new Set() },
  ...over,
});

describe("countersigns (C2–C5)", () => {
  it("counts a clean session that hits the endorsed anchor", async () => {
    const chain = new FakeChain();
    const t = chain.add({ from: BOB, to: APP, block: 1_500n });
    const r = await verifyVersionData(input({ countersigns: [record(BOB, 2n, [t])] }), chain);
    expect(r.countersigns).toMatchObject({ total: 1, counted: 1, rejected: 0 });
    expect(r.status).toBe("ok");
    expect(r.incidents).toEqual([]);
  });

  const rejectCases: [string, (c: FakeChain) => Hex[], string][] = [
    ["tx-not-found", () => [keccak256(toHex("missing"))], "tx-not-found"],
    ["reverted tx", (c) => [c.add({ from: BOB, to: APP, block: 1_500n, status: "reverted" })], "tx-failed"],
    ["someone else's tx", (c) => [c.add({ from: CAROL, to: APP, block: 1_500n })], "not-from-signer"],
    ["before registration", (c) => [c.add({ from: BOB, to: APP, block: 900n })], "before-registration"],
    ["after the record", (c) => [c.add({ from: BOB, to: APP, block: 2_500n })], "after-record"],
    ["undeclared target (e.g. a router)", (c) => [c.add({ from: BOB, to: ROUTER, block: 1_500n })], "undeclared-target"],
    ["undeclared function", (c) => [c.add({ from: BOB, to: APP, input: "0xdeadbeef", block: 1_500n })], "undeclared-function"],
    ["value over cap", (c) => [c.add({ from: BOB, to: APP, value: 1n, block: 1_500n })], "value-over-cap"],
    ["wrong chain", (c) => [c.add({ from: BOB, to: APP, block: 1_500n, chainId: 1 })], "wrong-chain"],
    [
      "no anchor hit (only a shared token was touched)",
      (c) => [c.add({ from: BOB, to: TOKEN, input: (APPROVE + "0".repeat(128)) as Hex, block: 1_500n })],
      "no-anchor-hit",
    ],
    [
      "approval to an undeclared spender",
      (c) => [
        c.add({ from: BOB, to: APP, block: 1_500n, logs: [{ address: TOKEN, topics: [TOPIC_APPROVAL, topic(BOB), topic(RANDO)], data: amount(1n) }] }),
      ],
      "approval-undeclared",
    ],
    [
      "approval above the cap",
      (c) => [
        c.add({ from: BOB, to: APP, block: 1_500n, logs: [{ address: TOKEN, topics: [TOPIC_APPROVAL, topic(BOB), topic(APP)], data: amount(101n) }] }),
      ],
      "approval-over-cap",
    ],
    [
      "direct transfer to an undeclared recipient",
      (c) => [
        c.add({ from: BOB, to: APP, block: 1_500n }),
        c.add({
          from: BOB,
          to: TOKEN,
          input: TRANSFER as Hex,
          block: 1_501n,
          logs: [{ address: TOKEN, topics: [TOPIC_TRANSFER, topic(BOB), topic(RANDO)], data: amount(5n) }],
        }),
      ],
      "transfer-undeclared-recipient",
    ],
  ];
  for (const [name, build, reason] of rejectCases) {
    it(`rejects: ${name}`, async () => {
      const chain = new FakeChain();
      const r = await verifyVersionData(input({ countersigns: [record(BOB, 2n, build(chain))] }), chain);
      expect(r.countersigns.counted).toBe(0);
      expect(r.countersigns.rejectionReasons[reason]).toBe(1);
    });
  }

  it("rejects sessions older than 48 h before the countersign", async () => {
    const chain = new FakeChain();
    const t = chain.add({ from: BOB, to: APP, block: 1_500n });
    const r = await verifyVersionData(input({ countersigns: [record(BOB, 2n, [t], 1_500n + 384_001n)] }), chain);
    expect(r.countersigns.rejectionReasons["outside-window"]).toBe(1);
  });

  it("allows swaps that pay a pool, and declared direct transfers within cap", async () => {
    const chain = new FakeChain();
    const swap = chain.add({
      from: BOB,
      to: APP,
      block: 1_500n,
      logs: [{ address: TOKEN, topics: [TOPIC_TRANSFER, topic(BOB), topic(RANDO)], data: amount(999n) }],
    });
    const pay = chain.add({
      from: BOB,
      to: TOKEN,
      input: TRANSFER as Hex,
      block: 1_501n,
      logs: [{ address: TOKEN, topics: [TOPIC_TRANSFER, topic(BOB), topic(CAROL)], data: amount(50n) }],
    });
    const r = await verifyVersionData(input({ countersigns: [record(BOB, 2n, [swap, pay])] }), chain);
    expect(r.countersigns.counted).toBe(1);
  });

  it("excludes endorsers, and reporters who also countersigned", async () => {
    const chain = new FakeChain();
    const v = version();
    v.targets[1] = { ...v.targets[1]!, flags: 1, endorser: DAVE };
    const t1 = chain.add({ from: DAVE, to: APP, block: 1_500n });
    const t2 = chain.add({ from: BOB, to: APP, block: 1_500n });
    const r = await verifyVersionData(
      input({ version: v, countersigns: [record(DAVE, 4n, [t1]), record(BOB, 2n, [t2])], reports: [record(BOB, 2n, [t2], 2_000n, 2)] }),
      chain,
    );
    expect(r.countersigns.counted).toBe(0);
    expect(r.countersigns.rejectionReasons).toMatchObject({ "author-or-endorser": 1, "also-reported": 1 });
  });

  it("puts reciprocal author pairs in the peer count", async () => {
    const chain = new FakeChain();
    const t = chain.add({ from: BOB, to: APP, block: 1_500n });
    // alice (agent 1, this version's author) countersigned a version authored by bob (agent 2)
    const graph = { countersignedAuthors: new Set(["1>2"]) };
    const r = await verifyVersionData(input({ countersigns: [record(BOB, 2n, [t])], graph }), chain);
    expect(r.countersigns).toMatchObject({ counted: 0, peer: 1 });
  });
});

describe("incidents (I1–I3) and claims", () => {
  it("I1: code drift is an incident, and stops countersigns counting", async () => {
    const chain = new FakeChain();
    chain.code.set(APP.toLowerCase(), "0x60806040ff");
    const t = chain.add({ from: BOB, to: APP, block: 1_500n });
    const r = await verifyVersionData(input({ countersigns: [record(BOB, 2n, [t])] }), chain);
    expect(r.incidents).toEqual([expect.objectContaining({ kind: "drift", target: APP })]);
    expect(r.countersigns.rejectionReasons["target-code-changed"]).toBe(1);
    expect(r.status).toBe("incident");
  });

  it("I1: an upgraded proxy implementation is an incident", async () => {
    const chain = new FakeChain();
    const v = version();
    v.targets[0] = { ...v.targets[0]!, impl: IMPL };
    chain.storage.set(`${APP.toLowerCase()}:${EIP1967_IMPL_SLOT}`, pad(RANDO, { size: 32 }));
    const r = await verifyVersionData(input({ version: v }), chain);
    expect(r.incidents[0]).toMatchObject({ kind: "drift" });
    chain.storage.set(`${APP.toLowerCase()}:${EIP1967_IMPL_SLOT}`, pad(IMPL, { size: 32 }));
    expect((await verifyVersionData(input({ version: v }), chain)).incidents).toEqual([]);
  });

  it("I2: a tx sent by the author that moves the reporter's tokens is an incident", async () => {
    const chain = new FakeChain();
    const pull = chain.add({
      from: ALICE,
      to: APP,
      block: 1_500n,
      logs: [{ address: TOKEN, topics: [TOPIC_TRANSFER, topic(BOB), topic(ALICE)], data: amount(10n) }],
    });
    const r = await verifyVersionData(input({ reports: [record(BOB, 2n, [pull], 2_000n, 2)] }), chain);
    expect(r.incidents).toEqual([expect.objectContaining({ kind: "author-pull", txHash: pull })]);
    expect(r.claims.total).toBe(0);
  });

  it("I2: a declared PULL flow within cap is not an incident", async () => {
    const chain = new FakeChain();
    const v = version();
    v.targets[0] = { ...v.targets[0]!, flags: 1 | 2 };
    const pull = chain.add({
      from: ALICE,
      to: APP,
      block: 1_500n,
      logs: [{ address: TOKEN, topics: [TOPIC_TRANSFER, topic(BOB), topic(APP)], data: amount(100n) }],
    });
    const r = await verifyVersionData(input({ version: v, reports: [record(BOB, 2n, [pull], 2_000n, 2)] }), chain);
    expect(r.incidents).toEqual([]);
  });

  it("a competitor's smear from their own wallet is only a claim", async () => {
    const chain = new FakeChain();
    // mallory approves an attacker and sends tokens away from her own wallet, then reports the skill
    const smear = chain.add({
      from: MALLORY,
      to: TOKEN,
      input: TRANSFER as Hex,
      block: 1_500n,
      logs: [{ address: TOKEN, topics: [TOPIC_TRANSFER, topic(MALLORY), topic(RANDO)], data: amount(1n) }],
    });
    const good = chain.add({ from: BOB, to: APP, block: 1_600n });
    const r = await verifyVersionData(
      input({ countersigns: [record(BOB, 2n, [good])], reports: [record(MALLORY, 6n, [smear], 2_000n, 2)] }),
      chain,
    );
    expect(r.incidents).toEqual([]);
    expect(r.claims).toMatchObject({ total: 1, corroborated: false });
    expect(r.countersigns.counted).toBe(1);
    expect(r.status).toBe("ok");
  });

  it("three independent backed claims raise a warning, never an incident", async () => {
    const chain = new FakeChain();
    const reports = [
      [CAROL, 3n],
      [DAVE, 4n],
      [ERIN, 5n],
    ].map(([who, id]) => {
      const t = chain.add({
        from: who as Address,
        to: APP,
        block: 1_500n,
        logs: [{ address: TOKEN, topics: [TOPIC_APPROVAL, topic(who as Address), topic(RANDO)], data: amount(5n) }],
      });
      return record(who as Address, id as bigint, [t], 2_000n, 2);
    });
    const r = await verifyVersionData(input({ reports }), chain);
    expect(r.claims).toMatchObject({ total: 3, backed: 3, corroborated: true });
    expect(r.incidents).toEqual([]);
    expect(r.status).toBe("warning");
  });

  it("I3: harmful static findings in the published content are an incident", async () => {
    const chain = new FakeChain();
    const content: SkillFile[] = [{ path: "SKILL.md", bytes: new TextEncoder().encode("x") }];
    const r = await verifyVersionData(input({ content, staticCheck: () => ({ failedRules: ["RL2", "RL7"] }) }), chain);
    expect(r.incidents).toEqual([expect.objectContaining({ kind: "static", rules: ["RL2"] })]);
  });
});

describe("C1 canonical content", () => {
  const manifestJson = {
    schema: "countersign.manifest/v1",
    chainId: 56,
    publisher: ALICE,
    targets: [{ address: APP, anchor: true, functions: ["ping()"] }],
  };
  const files = (publisher: Address = ALICE): SkillFile[] => [
    { path: "SKILL.md", bytes: new TextEncoder().encode("# skill") },
    { path: "countersign.json", bytes: new TextEncoder().encode(JSON.stringify({ ...manifestJson, publisher })) },
  ];

  it("verified when content, publisher and manifest all match", async () => {
    const f = files();
    const v = version({ contentHash: hashSkillFiles(f).contentHash, manifestHash: parseManifest(manifestJson).manifestHash });
    const r = await verifyVersionData(input({ version: v, content: f }), new FakeChain());
    expect(r.canonical).toBe("verified");
  });

  it("mismatch when someone else registered the publisher's content (a squatter)", async () => {
    const f = files();
    const v = version({
      contentHash: hashSkillFiles(f).contentHash,
      manifestHash: parseManifest(manifestJson).manifestHash,
      registrant: MALLORY,
    });
    const r = await verifyVersionData(input({ version: v, content: f }), new FakeChain());
    expect(r.canonical).toBe("mismatch");
    expect(r.canonicalDetail.join()).toMatch(/not the publisher/);
    expect(r.status).toBe("warning");
  });

  it("mismatch when the content does not hash to the registered contentHash", async () => {
    const r = await verifyVersionData(input({ content: files() }), new FakeChain());
    expect(r.canonical).toBe("mismatch");
  });

  it("unavailable when the content cannot be fetched", async () => {
    const r = await verifyVersionData(input({ content: null, contentError: "404" }), new FakeChain());
    expect(r).toMatchObject({ canonical: "unavailable", canonicalDetail: ["404"] });
  });
});
