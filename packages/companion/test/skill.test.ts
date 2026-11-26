import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256 } from "viem";
import { parseManifest, readSkillDir } from "@countersign/core";
import { checkSkill } from "@countersign/redline";
import { checkCallAgainstManifest } from "../src/user.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const skillDir = join(root, "skills", "countersign");

describe("COUNTERSIGN's own skill", () => {
  it("passes COUNTERSIGN's own Red-Line Check with zero findings (no self-exemption)", async () => {
    const report = checkSkill(await readSkillDir(skillDir));
    expect(report.results.flatMap((r) => r.findings)).toEqual([]);
    expect(report.notes.filter((n) => !n.startsWith("skipped non-text"))).toEqual([]);
  });

  it("ships a bundle that is byte-identical to a fresh build", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cs-bundle-"));
    try {
      const out = join(dir, "countersign.mjs");
      execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-skill.mjs", import.meta.url)), "--outfile", out], { stdio: "pipe" });
      const fresh = await readFile(out);
      const committed = await readFile(join(skillDir, "scripts", "countersign.mjs"));
      expect(fresh.equals(committed), "run `pnpm build:skill` and commit the result").toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("checkCallAgainstManifest", () => {
  const APP = "0x1111111111111111111111111111111111111111";
  const TOKEN = "0x2222222222222222222222222222222222222222";
  const SPENDER = "0x3333333333333333333333333333333333333333";
  const WALLET = "0x4444444444444444444444444444444444444444";
  const m = parseManifest({
    schema: "countersign.manifest/v1",
    chainId: 56,
    publisher: WALLET,
    targets: [
      { address: APP, anchor: true, maxValueWei: "100", functions: ["ping()"] },
      { address: TOKEN, functions: ["approve(address,uint256)", "transfer(address,uint256)"] },
    ],
    flows: [
      { kind: "approve", token: TOKEN, counterparty: SPENDER, cap: "1000" },
      { kind: "transfer", token: TOKEN, counterparty: APP, cap: "50" },
    ],
  });
  const abi = [
    { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
    { type: "function", name: "transfer", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  ] as const;
  const levels = (r: ReturnType<typeof checkCallAgainstManifest>) => r.map((x) => x.level);

  it("allows declared calls within caps", () => {
    expect(levels(checkCallAgainstManifest(m, APP, "0x5c36b186", 100n, WALLET))).not.toContain("block");
    const approve = encodeFunctionData({ abi, functionName: "approve", args: [SPENDER, 1000n] });
    expect(levels(checkCallAgainstManifest(m, TOKEN, approve, 0n, WALLET))).not.toContain("block");
  });

  it("blocks what the manifest does not declare", () => {
    const block = (to: string, data: `0x${string}`, value = 0n) =>
      checkCallAgainstManifest(m, to as `0x${string}`, data, value, WALLET).filter((r) => r.level === "block").map((r) => r.text);
    expect(block(SPENDER, "0x5c36b186")[0]).toMatch(/not declared/);
    expect(block(APP, "0xdeadbeef")[0]).toMatch(/function 0xdeadbeef is not declared/);
    expect(block(APP, "0x5c36b186", 101n)[0]).toMatch(/above the declared cap/);
    expect(block(TOKEN, encodeFunctionData({ abi, functionName: "approve", args: [SPENDER, 1001n] }))[0]).toMatch(/exceeds the declared cap/);
    expect(block(TOKEN, encodeFunctionData({ abi, functionName: "approve", args: [WALLET, 1n] }))[0]).toMatch(/undeclared spender/);
    expect(block(TOKEN, encodeFunctionData({ abi, functionName: "approve", args: [SPENDER, maxUint256] })).join()).toMatch(/maximum amount/);
    expect(block(TOKEN, encodeFunctionData({ abi, functionName: "transfer", args: [SPENDER, 1n] }))[0]).toMatch(/undeclared recipient/);
  });
});
