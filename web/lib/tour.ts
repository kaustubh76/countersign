/**
 * "Watch it": the landing page plays itself, start to finish, in about 20 seconds. The steps and the
 * keyboard map are plain data here, so tests can pin the order, the captions and the timing.
 */

export type TourId = "bots" | "ink" | "real" | "again" | "ledger" | "receipt" | "blocked" | "close";

export interface TourStep {
  id: TourId;
  /** What the tour chip says while this step plays (at most 4 words). */
  cap: string;
  /** How long to stay on the step once its action has run, in ms (its animations included). */
  ms: number;
}

export const TOUR: TourStep[] = [
  { id: "bots", cap: "1,000 bots", ms: 2800 },
  { id: "ink", cap: "Forged by hand", ms: 2300 },
  { id: "real", cap: "Real use", ms: 2900 },
  { id: "again", cap: "Same ID again", ms: 1700 },
  { id: "ledger", cap: "Six more attacks", ms: 2700 },
  { id: "receipt", cap: "The receipt", ms: 2700 },
  { id: "blocked", cap: "Blocked before signing", ms: 3300 },
  { id: "close", cap: "Your move", ms: 1100 },
];

/** The planned length of the tour (the actions themselves add a little). */
export const tourMs = (steps: TourStep[] = TOUR): number => steps.reduce((n, s) => n + s.ms, 0);

/** Where the progress line starts and ends for step `i`, as fractions of the whole tour (time, not steps). */
export function tourSpan(i: number, steps: TourStep[] = TOUR): { from: number; to: number } {
  const total = tourMs(steps) || 1;
  const before = tourMs(steps.slice(0, Math.max(0, i)));
  return { from: before / total, to: (before + (steps[i]?.ms ?? 0)) / total };
}

export type Shortcut = "bots" | "ink" | "real" | "watch" | "stop";

export interface KeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** Focus is somewhere you type (input, textarea, select, contenteditable). */
  editable?: boolean;
}

const KEYS: Record<string, Shortcut> = { b: "bots", s: "ink", r: "real", w: "watch", escape: "stop" };

/** B sends the bots, S signs by hand, R uses it for real, W plays the tour, Esc stops it. */
export function shortcutFor(e: KeyInput): Shortcut | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.editable) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}

/** True for a target where a letter key means typing, not a shortcut. */
export function isEditable(t: unknown): boolean {
  if (!t || typeof t !== "object") return false;
  const el = t as { tagName?: unknown; isContentEditable?: unknown };
  return el.isContentEditable === true || (typeof el.tagName === "string" && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}
