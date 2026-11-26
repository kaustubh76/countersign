import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import {
  agentIdOfHandle,
  computeVersionId,
  manifestHash,
  ManifestError,
  parseManifest,
  type ManifestJson,
} from "../src/manifest.js";

// Vectors computed independently with `cast abi-encode` + `cast keccak` (see repo history for the commands).
const MANIFEST_HASH = "0x9c61789f78a093247b9d0876b6cd8b7f94d42296c42dd8cb1f2efa0a36c915f3";
const CONTENT_HASH = "0x0f1efb83ddd01f01bc3bcbac6a62a26c3357bfc30390fae5b72534085d71d82d";
const VERSION_ID = "0xccf158c3b94c9f300ecb639e0717fd5016a5bcaa8d2ecfa9ed7999fe4e2e0efd";
// keccak256("kausty"), verified against ownerOf on the live BSC registry
const KAUSTY_ID = 92547891976066845829652464444792193925043206974919508907241051023344639194362n;

const valid = (): ManifestJson => ({
  schema: "countersign.manifest/v1",
  chainId: 56,
  publisher: "0xFcB663BaA6A05e2582975D97558B76f38791B24f",
  name: "demo",
  targets: [
    { address: "0x1111111111111111111111111111111111111111", label: "App", anchor: true, functions: ["ping()"] },
    {
      address: "0x2222222222222222222222222222222222222222",
      maxValueWei: "1000000000000000000",
      functions: ["0xa9059cbb"],
    },
  ],
  flows: [
    {
      kind: "approve",
      token: "0x3333333333333333333333333333333333333333",
      counterparty: "0x1111111111111111111111111111111111111111",
      cap: "100000000000000000000",
    },
  ],
  builtins: ["market-order"],
});

describe("parseManifest", () => {
  it("derives the exact on-chain arrays", () => {
    const p = parseManifest(valid());
    expect(p.chainId).toBe(56);
    expect(p.publisher).toBe("0xFcB663BaA6A05e2582975D97558B76f38791B24f");
    expect(p.onchain.targets).toEqual([
      { target: "0x1111111111111111111111111111111111111111", impl: zeroAddress, maxValue: 0n, flags: 1 },
      { target: "0x2222222222222222222222222222222222222222", impl: zeroAddress, maxValue: 10n ** 18n, flags: 0 },
    ]);
    expect(p.onchain.permissions).toEqual([
      { targetIndex: 0, selector: "0x5c36b186" },
      { targetIndex: 1, selector: "0xa9059cbb" },
    ]);
    expect(p.onchain.flows).toEqual([
      {
        token: "0x3333333333333333333333333333333333333333",
        counterparty: "0x1111111111111111111111111111111111111111",
        kind: 0,
        cap: 100n * 10n ** 18n,
      },
    ]);
    expect(p.labels["0x1111111111111111111111111111111111111111"]).toBe("App");
    expect(p.builtins).toEqual(["market-order"]);
  });

  it("hashes exactly like Solidity's abi.encode (independent cast vector)", () => {
    const p = parseManifest(valid());
    expect(p.manifestHash).toBe(MANIFEST_HASH);
    expect(manifestHash(p.onchain)).toBe(MANIFEST_HASH);
  });

  it("collects every problem with a precise location", () => {
    const bad = valid() as unknown as Record<string, unknown>;
    bad.schema = "v0";
    bad.publisher = "0x123";
    (bad.targets as ManifestJson["targets"]).push(
      { address: "0x1111111111111111111111111111111111111111", functions: ["ping()", "ping()"] },
      { address: "not-an-address", functions: [] },
    );
    (bad.flows as ManifestJson["flows"])!.push(
      { kind: "approve", token: "native", counterparty: "0x1111111111111111111111111111111111111111", cap: "1" },
      {
        kind: "transfer",
        token: "0x3333333333333333333333333333333333333333",
        counterparty: "0x1111111111111111111111111111111111111111",
        cap: (2n ** 256n - 1n).toString(),
      },
    );
    bad.builtins = ["teleport"];
    try {
      parseManifest(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ManifestError);
      const text = (e as ManifestError).problems.join("\n");
      expect(text).toMatch(/schema must be/);
      expect(text).toMatch(/publisher: not an address/);
      expect(text).toMatch(/targets\[2\]\.address: duplicate target/);
      expect(text).toMatch(/targets\[2\]\.functions: duplicate selector/);
      expect(text).toMatch(/targets\[3\]\.address: not an address/);
      expect(text).toMatch(/targets\[3\]\.functions: list at least one function/);
      expect(text).toMatch(/flows\[1\]: native BNB cannot be approved/);
      expect(text).toMatch(/flows\[2\]\.cap: unlimited caps are not allowed/);
      expect(text).toMatch(/builtins: unknown action "teleport"/);
    }
  });

  it("enforces the on-chain limits before a tx can revert", () => {
    const many = valid();
    many.targets = Array.from({ length: 17 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      functions: ["ping()"],
    }));
    expect(() => parseManifest(many)).toThrow(/at most 16/);
  });

  it("allows native BNB transfer flows", () => {
    const m = valid();
    m.flows = [{ kind: "transfer", token: "native", counterparty: "0x4444444444444444444444444444444444444444", cap: "5" }];
    expect(parseManifest(m).onchain.flows[0]).toMatchObject({ token: zeroAddress, kind: 1, cap: 5n });
  });
});

describe("version ids and Agent IDs", () => {
  it("computes versionId like SkillRegistry (independent cast vector)", () => {
    expect(computeVersionId(CONTENT_HASH, MANIFEST_HASH, KAUSTY_ID)).toBe(VERSION_ID);
  });

  it("derives the Agent ID tokenId from a handle, with or without .ai", () => {
    expect(agentIdOfHandle("kausty")).toBe(KAUSTY_ID);
    expect(agentIdOfHandle("kausty.ai")).toBe(KAUSTY_ID);
  });
});
