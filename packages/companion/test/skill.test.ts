import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256 } from "viem";
import { parseManifest, readSkillDir } from "@countersign/core";
import { checkSkill } from "@countersign/redline";
import { parseArgs } from "../src/args.js";
import {
  checkCallAgainstManifest,
  checkCallWithoutManifest,
  cmdCheckCall,
  cmdCheckInstall,
  rankCandidates,
  RISK_NOTICE,
  signalLine,
  type Candidate,
} from "../src/user.js";

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

describe("pre-flight without a manifest (the §13 attack skill)", () => {
  const TOKEN = "0x55d398326f99059fF775485246999027B3197955";
  const ATTACKER = "0x000000000000000000000000000000000000bEEF";
  const approve = (amount: bigint) =>
    encodeFunctionData({ abi: [{ type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" }], functionName: "approve", args: [ATTACKER, amount] });

  it("blocks an approval for the maximum amount even when nothing is declared, and only warns otherwise", () => {
    const max = checkCallWithoutManifest(TOKEN, approve(maxUint256), 0n);
    expect(max.filter((r) => r.level === "block").map((r) => r.text)).toEqual([expect.stringMatching(/maximum amount/)]);
    expect(max.map((r) => r.text).join()).toMatch(/a spender the skill never declared/);
    expect(checkCallWithoutManifest(TOKEN, approve(10n), 0n).some((r) => r.level === "block")).toBe(false);
  });

  it("runs as the demo script says, before any deployment: check-install and check-call both BLOCK", async () => {
    const dir = execFileSync(process.execPath, [join(root, "demo", "make-attack-skill.mjs")], { encoding: "utf8" }).trim();
    try {
      const install = await cmdCheckInstall(parseArgs(["check-install", dir, "--offline", "--chain", "56"]));
      expect(install.verdict).toBe("block");
      expect(install.say).toMatch(/^Blocked: RL2/);
      expect(install.say).toMatch(/Not registered · Countersigned by 0 · 0 verified incidents/);
      expect(install.reasons?.map((r) => r.text)).toEqual(expect.arrayContaining([expect.stringMatching(/not deployed on chain 56 yet/), RISK_NOTICE]));
      const call = await cmdCheckCall(parseArgs(["check-call", "--skill", dir, "--to", TOKEN, "--data", approve(maxUint256), "--chain", "56"]));
      expect(call.verdict).toBe("block");
      expect(call.say).toMatch(/approval for the maximum amount/);
      expect(call.data?.riskNotice).toBe(RISK_NOTICE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("choosing between skills (§6.3)", () => {
  const c = (name: string, over: Partial<Candidate["signal"]> = {}, blocked: string | null = null): Candidate => ({
    name,
    versionId: null,
    blocked,
    signal: { registered: true, attested: false, guarded: 0, counted: 0, established: null, incidents: 0, ...over },
  });

  it("never prefers an incident or a harmful skill, whatever its counts; then more verified humans win", () => {
    const ranked = rankCandidates([
      c("popular-but-hurt", { counted: 900, incidents: 1 }),
      c("bundles-approval", { counted: 50 }, "fails RL2, RL3"),
      c("small-honest", { counted: 3, attested: true }),
      c("bigger-honest", { counted: 7 }),
      c("same-but-established", { counted: 7, established: 4 }),
      c("unregistered", { registered: false }),
    ]);
    expect(ranked.map((x) => x.name).slice(0, 4)).toEqual(["same-but-established", "bigger-honest", "small-honest", "unregistered"]);
    // both "do not use" ones come last, whatever their counts
    expect(new Set(ranked.slice(4).map((x) => x.name))).toEqual(new Set(["bundles-approval", "popular-but-hurt"]));
  });

  it("says the human signal the same way everywhere", () => {
    expect(signalLine({ registered: true, attested: true, guarded: 1, counted: 27, established: 9, incidents: 0 })).toBe(
      "Registered ✓ · Red-line attested ✓ · Guarded ✓ · Countersigned by 27 (9 established) · 0 verified incidents",
    );
    expect(signalLine({ registered: false, attested: false, guarded: 0, counted: 0, established: null, incidents: 0 })).toBe("Not registered · Countersigned by 0 · 0 verified incidents");
  });
});
