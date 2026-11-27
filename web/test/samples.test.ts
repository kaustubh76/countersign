import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSkillDir } from "@countersign/core";
import { checkSkill } from "@countersign/redline";
import { attackSampleFiles } from "../lib/attackSample";

const here = dirname(fileURLToPath(import.meta.url));

describe("Red-Line samples shown on the site", () => {
  it("the malicious sample is blocked on RL2 and RL3", () => {
    const failed = checkSkill(attackSampleFiles()).results.filter((r) => !r.passed).map((r) => r.rule);
    expect(failed).toEqual(["RL2", "RL3"]);
  });

  it("COUNTERSIGN's own skill passes every rule with no findings", async () => {
    const report = checkSkill(await readSkillDir(resolve(here, "../../skills/countersign")));
    expect(report.results.every((r) => r.passed && r.findings.length === 0)).toBe(true);
  });
});
