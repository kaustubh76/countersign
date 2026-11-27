import { describe, expect, it } from "vitest";
import { INITIAL_DUEL, sendBots, useForReal } from "../lib/duel";

describe("landing page duel (real verifier behind every verdict)", () => {
  it("bots raise downloads but never countersigns", async () => {
    let s = INITIAL_DUEL;
    for (let i = 0; i < 3; i++) s = await sendBots(s);
    expect(s.downloads).toBe(INITIAL_DUEL.downloads + 3000);
    expect(s.countersigns).toBe(0);
    expect(s.events.every((e) => e.kind === "bots" && e.error === "NotAgentIdHolder")).toBe(true);
  });

  it("a real session counts once; the same Agent ID trying again is refused", async () => {
    let s = await useForReal(INITIAL_DUEL);
    expect(s.countersigns).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ kind: "real", outcome: "counted", error: null });
    expect((s.events.at(-1) as { checks: { ok: boolean }[] }).checks.every((c) => c.ok)).toBe(true);
    s = await useForReal(s);
    expect(s.countersigns).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ kind: "real", outcome: "reverted", error: "AlreadyCountersigned" });
  });
});
