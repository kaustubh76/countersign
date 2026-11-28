import { describe, expect, it } from "vitest";
import { isEditable, shortcutFor, TOUR, tourMs, tourSpan } from "../lib/tour";

describe("watch it: the landing plays itself", () => {
  it("tells the story in order, in short captions, in about 20 seconds", () => {
    expect(TOUR.map((s) => s.id)).toEqual(["bots", "ink", "real", "again", "ledger", "receipt", "blocked", "close"]);
    for (const s of TOUR) expect(s.cap.split(/\s+/).length).toBeLessThanOrEqual(4);
    // Planned dwell; the scribble and the ledger's scroll add about a second.
    expect(tourMs()).toBeGreaterThanOrEqual(17_000);
    expect(tourMs()).toBeLessThanOrEqual(20_000);
  });

  it("splits the progress line by time, end to end", () => {
    expect(tourSpan(0).from).toBe(0);
    expect(tourSpan(TOUR.length - 1).to).toBeCloseTo(1, 10);
    for (let i = 1; i < TOUR.length; i++) expect(tourSpan(i).from).toBeCloseTo(tourSpan(i - 1).to, 10);
  });

  it("maps B, S, R, W and Esc, never while typing, repeating or holding a modifier", () => {
    expect(["b", "B", "s", "r", "R", "w", "Escape"].map((key) => shortcutFor({ key }))).toEqual(["bots", "bots", "ink", "real", "real", "watch", "stop"]);
    expect(shortcutFor({ key: "x" })).toBeNull();
    expect(shortcutFor({ key: "Enter" })).toBeNull();
    expect(shortcutFor({ key: "r", metaKey: true })).toBeNull();
    expect(shortcutFor({ key: "r", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: "b", altKey: true })).toBeNull();
    expect(shortcutFor({ key: "b", repeat: true })).toBeNull();
    expect(shortcutFor({ key: "w", editable: true })).toBeNull();
  });

  it("knows where a letter key means typing", () => {
    expect(isEditable({ tagName: "INPUT" })).toBe(true);
    expect(isEditable({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditable({ tagName: "SELECT" })).toBe(true);
    expect(isEditable({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isEditable({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(isEditable(null)).toBe(false);
    // a keydown aimed at window itself (no tagName)
    expect(isEditable({ addEventListener() {} })).toBe(false);
  });
});
