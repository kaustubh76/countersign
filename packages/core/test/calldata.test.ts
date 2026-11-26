import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { countersignAbi, skillRegistryAbi } from "../src/abi.js";
import { checkTxHashes, encodeCountersign, encodeEndorseAnchor, encodeRegister, encodeReport } from "../src/calldata.js";
import { parseManifest } from "../src/manifest.js";

const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const manifest = parseManifest({
  schema: "countersign.manifest/v1",
  chainId: 56,
  publisher: "0xFcB663BaA6A05e2582975D97558B76f38791B24f",
  targets: [{ address: "0x1111111111111111111111111111111111111111", anchor: true, functions: ["ping()"] }],
}).onchain;

describe("calldata", () => {
  it("encodes register with the manifest arrays", () => {
    const data = encodeRegister(h(1) as `0x${string}`, "https://github.com/o/r/tree/abc/skill", manifest);
    const decoded = decodeFunctionData({ abi: skillRegistryAbi, data });
    expect(decoded.functionName).toBe("register");
    expect(decoded.args?.[0]).toBe(h(1));
    expect(decoded.args?.[1]).toBe("https://github.com/o/r/tree/abc/skill");
    expect(decoded.args?.[2]).toEqual(manifest.targets);
    expect(decoded.args?.[3]).toEqual(manifest.permissions);
  });

  it("rejects contentURIs the contract would reject", () => {
    expect(() => encodeRegister(h(1) as `0x${string}`, "", manifest)).toThrow(/contentURI/);
    expect(() => encodeRegister(h(1) as `0x${string}`, "x".repeat(513), manifest)).toThrow(/contentURI/);
  });

  it("encodes countersign / report / endorse", () => {
    const cs = decodeFunctionData({ abi: countersignAbi, data: encodeCountersign(h(9) as `0x${string}`, [h(1), h(2)]) });
    expect(cs.functionName).toBe("countersign");
    expect(cs.args?.[1]).toEqual([h(1), h(2)]);
    expect(decodeFunctionData({ abi: countersignAbi, data: encodeReport(h(9) as `0x${string}`, [h(3)]) }).functionName).toBe(
      "report",
    );
    expect(decodeFunctionData({ abi: skillRegistryAbi, data: encodeEndorseAnchor(h(9) as `0x${string}`, 0) }).functionName).toBe(
      "endorseAnchor",
    );
  });

  it("validates cited tx hashes like the contract", () => {
    expect(() => checkTxHashes([])).toThrow(/between 1 and 8/);
    expect(() => checkTxHashes(Array.from({ length: 9 }, (_, i) => h(i + 1)))).toThrow(/between 1 and 8/);
    expect(() => checkTxHashes([h(0)])).toThrow(/zero/);
    expect(() => checkTxHashes([h(1), h(1)])).toThrow(/duplicate/);
    expect(() => checkTxHashes(["0x1234"])).toThrow(/not a transaction hash/);
    expect(checkTxHashes([h(1).toUpperCase().replace("0X", "0x")])).toEqual([h(1)]);
  });
});
