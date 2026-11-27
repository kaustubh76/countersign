import { describe, expect, it } from "vitest";
import { scenarioById } from "../lib/sim/scenarios";
import { decisiveLine, decisiveStep, receiptFrom } from "../lib/sim/summary";

/** The six attacks the landing page's ledger lets visitors run inline. */
const LANDING = ["bot-farm", "friend", "borrow", "shared-token", "self", "smear"];

describe("scenario summaries for the landing page", () => {
  it.each(LANDING)("%s: one decisive step, a fail or a warning, never counted", async (id) => {
    const r = await scenarioById(id)!.run();
    expect(r.outcome).not.toBe("counted");
    const step = decisiveStep(r);
    expect(step).not.toBeNull();
    expect(["fail", "warn"]).toContain(step!.state);
    expect(decisiveLine(r)).toBeTruthy();
  });

  it("the honest session has no decisive step and makes a counted receipt for Agent ID #2", async () => {
    const r = await scenarioById("honest")!.run();
    expect(decisiveStep(r)).toBeNull();
    const receipt = receiptFrom(r);
    expect(receipt.outcome).toBe("counted");
    expect(receipt.agentId).toBe("#2");
    expect(receipt.txs).toHaveLength(2);
    expect(receipt.txs.some((t) => t.to === "author's vault")).toBe(true);
    expect(receipt.checks.every((c) => c.ok)).toBe(true);
    expect(JSON.parse(JSON.stringify(receipt))).toEqual(receipt);
  });
});
