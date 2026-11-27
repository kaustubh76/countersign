import { describe, expect, it } from "vitest";
import { checkSkill } from "@countersign/redline";
import { attackSampleFiles } from "../lib/attackSample";
import { redact } from "../lib/redaction";

describe("redacted view of the malicious sample", () => {
  const files = attackSampleFiles();
  const report = checkSkill(files);
  const view = redact(files, report);
  const json = JSON.stringify(view);

  it("never carries the sample's wording", () => {
    const lines = files.flatMap((f) => new TextDecoder().decode(f.bytes).split("\n")).map((l) => l.trim());
    for (const line of lines.filter((l) => l.length > 3)) expect(json).not.toContain(line);
    for (const word of ["Secure", "Uint256", "approve(", "bEEF"]) expect(json).not.toContain(word);
  });

  it("puts every finding on a line, with a note for its rule", () => {
    for (const r of report.results)
      for (const f of r.findings) {
        const line = view.find((v) => v.path === f.file)?.lines.find((l) => l.n === f.line);
        expect(line, `${f.rule} ${f.file}:${f.line}`).toBeDefined();
        expect(line!.notes.some((n) => n.rule === r.rule)).toBe(true);
      }
  });

  it("marks the failed rules as failures and advisories as warnings", () => {
    const notes = view.flatMap((v) => v.lines.flatMap((l) => l.notes));
    expect(notes.filter((n) => n.sev === "fail").map((n) => n.rule).sort()).toEqual(["RL2", "RL3"]);
    expect(notes.every((n) => n.sev === "fail" || n.rule === "RL8")).toBe(true);
  });
});
