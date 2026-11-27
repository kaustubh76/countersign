import { describe, expect, it } from "vitest";
import { parseScore, scoreLine } from "../lib/score";

describe("share score", () => {
  it("accepts 1..max only, in canonical form", () => {
    expect(parseScore("1", 11)).toBe(1);
    expect(parseScore("11", 11)).toBe(11);
    for (const bad of ["0", "12", "-1", "01", "1.5", "abc", "", "99"]) expect(parseScore(bad, 11)).toBeNull();
  });
  it("says none counted", () => {
    expect(scoreLine(11, 11)).toBe("I tried 11 of 11 ways to fake a countersign. None counted.");
  });
});
