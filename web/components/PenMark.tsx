import type { CSSProperties } from "react";

/**
 * Red-pen marks drawn over paper: a loose circle, a strike-through, an underline or a bracket. Each path
 * draws itself in (stroke-dashoffset over pathLength 1) when the mark, or an ancestor, gets `is-playing`.
 * Without that class the mark is simply drawn, so server HTML and reduced motion show the final state.
 */
const PATHS = {
  circle: { box: "0 0 120 60", d: "M66 6 C34 3 6 13 5 31 C4 49 38 57 66 55 C95 53 117 44 115 27 C113 11 88 4 58 7 C50 8 44 10 40 12" },
  strike: { box: "0 0 120 20", d: "M3 13 C30 9 58 12 84 8 C97 6 108 7 117 5" },
  underline: { box: "0 0 120 14", d: "M3 6 C28 10 56 4 82 8 C96 10 108 6 117 8" },
  bracket: { box: "0 0 20 120", d: "M15 4 C6 6 7 20 7 36 C7 50 3 56 1 60 C3 64 7 70 7 84 C7 100 6 114 15 116" },
} as const;

export type PenKind = keyof typeof PATHS;

export function PenMark({ kind, className, delay = 0, style }: { kind: PenKind; className?: string; delay?: number; style?: CSSProperties }) {
  const p = PATHS[kind];
  return (
    <svg
      className={`pen-mark pen-${kind}${className ? ` ${className}` : ""}`}
      viewBox={p.box}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ ...style, ["--pen-d" as string]: `${delay}ms` }}
    >
      <path d={p.d} pathLength={1} />
    </svg>
  );
}
