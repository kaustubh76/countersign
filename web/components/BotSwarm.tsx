"use client";

import { useMemo, type CSSProperties } from "react";
import { swarmLayout } from "@/lib/duel";

/**
 * A thousand bots, drawn as a few dozen wallet stubs that pile onto the signature line, get struck out
 * and drop away. Decorative only (the verdict is in the log); clipped to its own layer.
 */
export function BotSwarm({ seed, count = 48 }: { seed: number; count?: number }) {
  const bits = useMemo(() => swarmLayout(count, seed), [count, seed]);
  return (
    <div className="swarm" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.x}%`, top: `${b.y}%`, ["--r" as string]: `${b.rot}deg`, ["--d" as string]: `${b.delay}ms` } as CSSProperties}>
          {b.stub}
        </i>
      ))}
    </div>
  );
}
