import { describe, expect, it } from "vitest";
import { countersignAbi } from "@countersign/core";
import { REVERT_WHY } from "../lib/sim/contract";
import { DEFAULT_BUILDER, runBuilder, SCENARIOS, type BuilderOptions } from "../lib/sim/scenarios";

// The playground's claims must match what the real verifier (countersign.ruleset/v1) decides.
describe("Try-to-fake-it scenarios", () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: ${s.expected}`, async () => {
      const r = await s.run();
      expect(r.outcome).toBe(s.expected);
      expect(r.steps.length).toBeGreaterThan(0);
    });
  }

  it("no fake attempt is ever counted, and the honest session is", async () => {
    const results = await Promise.all(SCENARIOS.map(async (s) => [s, await s.run()] as const));
    for (const [s, r] of results) {
      if (s.group === "fake") expect(r.outcome, s.id).not.toBe("counted");
    }
    const honest = results.find(([s]) => s.id === "honest")![1];
    expect(honest.report.countersigns.counted).toBe(1);
    expect(honest.report.status).toBe("ok");
  });

  it("stops each attack for the stated reason", async () => {
    const by = async (id: string) => SCENARIOS.find((s) => s.id === id)!.run();
    expect((await by("bot-farm")).revert?.error).toBe("NotAgentIdHolder");
    expect((await by("self")).revert?.error).toBe("SelfCountersign");
    expect((await by("twice")).revert?.error).toBe("AlreadyCountersigned");
    expect((await by("replay")).revert?.error).toBe("TxAlreadyUsed");
    expect((await by("friend")).verdict?.reasons).toEqual(expect.arrayContaining(["undeclared-target", "no-anchor-hit"]));
    expect((await by("borrow")).verdict?.reasons).toContain("not-from-signer");
    expect((await by("shared-token")).verdict?.reasons).toEqual(["no-anchor-hit"]);
    expect((await by("stale")).verdict?.reasons).toContain("outside-window");
    expect((await by("ring")).verdict?.status).toBe("peer");
    const smear = await by("smear");
    expect(smear.report.incidents).toEqual([]);
    expect(smear.report.claims.total).toBe(1);
    expect(smear.report.countersigns.counted).toBe(1);
    expect((await by("squat")).report.canonical).toBe("mismatch");
    expect((await by("rug")).report.incidents[0]?.kind).toBe("drift");
    expect((await by("pull")).report.incidents[0]?.kind).toBe("author-pull");
    expect((await by("hidden")).report.incidents[0]).toMatchObject({ kind: "static", rules: ["RL2"] });
  });

  it("the honest world is canonical and passes the static check", async () => {
    const r = await SCENARIOS.find((s) => s.id === "honest")!.run();
    expect(r.report.canonical).toBe("verified");
    expect(r.report.incidents).toEqual([]);
  });
});

describe("contract mirror", () => {
  it("only uses custom errors that exist in the Countersign ABI", () => {
    const errors = new Set(countersignAbi.filter((x) => x.type === "error").map((x) => (x as { name: string }).name));
    for (const name of Object.keys(REVERT_WHY)) expect(errors, name).toContain(name);
  });
});

describe("build your own countersign", () => {
  const run = (o: Partial<BuilderOptions>) => runBuilder({ ...DEFAULT_BUILDER, ...o });
  it("the default (a real, recent, capped session on the vault) counts", async () => {
    expect((await run({})).outcome).toBe("counted");
  });
  it.each([
    [{ signer: "bot" }, "reverted"],
    [{ signer: "author" }, "reverted"],
    [{ sender: "someone" }, "rejected"],
    [{ target: "token" }, "rejected"],
    [{ target: "other" }, "rejected"],
    [{ fn: "undeclared" }, "rejected"],
    [{ when: "old" }, "rejected"],
    [{ when: "before" }, "rejected"],
    [{ approval: "over-cap" }, "rejected"],
    [{ approval: "undeclared" }, "rejected"],
    [{ status: "reverted" }, "rejected"],
  ] as [Partial<BuilderOptions>, string][])("%o → %s", async (o, outcome) => {
    expect((await run(o)).outcome).toBe(outcome);
  });
});
