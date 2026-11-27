import { describe, expect, it } from "vitest";
import { botTraffic, INITIAL_DUEL, sendBots, shareText, signWithInk, swarmLayout, useForReal } from "../lib/duel";

describe("landing page duel (real verifier behind every verdict)", () => {
  it("bots raise downloads but never countersigns", async () => {
    let s = INITIAL_DUEL;
    for (let i = 0; i < 3; i++) s = await sendBots(s);
    expect(s.downloads).toBe(INITIAL_DUEL.downloads + 3000);
    expect(s.countersigns).toBe(0);
    expect(s.refused).toBe(3000);
    expect(s.events.every((e) => e.kind === "bots" && e.error === "NotAgentIdHolder")).toBe(true);
  });

  it("a hand-drawn signature is refused like any wallet without an Agent ID", async () => {
    const s = await signWithInk(INITIAL_DUEL);
    expect(s.events.at(-1)).toEqual({ kind: "ink", error: "NotAgentIdHolder" });
    expect(s.refused).toBe(1);
    expect(s.countersigns).toBe(0);
    expect(s.downloads).toBe(INITIAL_DUEL.downloads);
    expect(s.signed).toBe(false);
  });

  it("a real session counts once; the same Agent ID trying again is refused", async () => {
    let s = await useForReal(INITIAL_DUEL);
    expect(s.countersigns).toBe(1);
    const real = s.events.at(-1);
    expect(real).toMatchObject({ kind: "real", outcome: "counted", error: null });
    if (real?.kind !== "real") throw new Error("expected a real event");
    expect(real.checks.map((c) => c.id)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
    expect(real.checks.every((c) => c.ok)).toBe(true);
    expect(real.txs).toHaveLength(2);
    expect(real.txs[0]!.what).toMatch(/^approve 50 USD/);
    expect(real.txs[1]!.what).toMatch(/^deposit 50 USD/);
    expect(real.txs.every((t) => /min ago$/.test(t.when))).toBe(true);
    s = await useForReal(s);
    expect(s.countersigns).toBe(1);
    expect(s.refused).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ kind: "real", outcome: "reverted", error: "AlreadyCountersigned", txs: [] });
  });

  it("attract-mode traffic moves downloads only", () => {
    const s = botTraffic(INITIAL_DUEL, 5);
    expect(s).toEqual({ ...INITIAL_DUEL, downloads: INITIAL_DUEL.downloads + 5 });
  });

  it("swarm layout is deterministic, in bounds, and staggered", () => {
    const a = swarmLayout(48, 7);
    expect(swarmLayout(48, 7)).toEqual(a);
    expect(swarmLayout(48, 8)).not.toEqual(a);
    expect(a).toHaveLength(48);
    for (const b of a) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(80);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(80);
      expect(Math.abs(b.rot)).toBeLessThanOrEqual(16);
      expect(b.stub).toMatch(/^0x[0-9a-f]{4}$/);
    }
    expect(a.at(-1)!.delay).toBeGreaterThan(a[0]!.delay);
    expect(Math.max(...a.map((b) => b.delay))).toBeLessThanOrEqual(1150 + 90);
  });

  it("share text uses the visitor's own demo numbers and always says it's a demo", async () => {
    let s = await sendBots(INITIAL_DUEL);
    expect(shareText(s)).toBe(`Demo: I sent 1,000 bots at a skill certificate. Downloads: ${(INITIAL_DUEL.downloads + 1000).toLocaleString("en-US")}. Countersigns: 0.`);
    s = await signWithInk(s);
    expect(shareText(s)).toContain("forged the signature by hand too: void.");
    s = await useForReal(s);
    expect(shareText(s)).toMatch(/Countersigns: 0\..*Then I used it for real: 1 countersign\.$/);
    for (const state of [INITIAL_DUEL, s]) {
      expect(shareText(state).startsWith("Demo: ")).toBe(true);
      expect(shareText(state)).not.toMatch(/on-chain|verified/i);
    }
  });
});
