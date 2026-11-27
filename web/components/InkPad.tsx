"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { prefersReducedMotion, useLater } from "@/lib/motion";
import { PenMark } from "./PenMark";

type Pt = [number, number];
type Phase = "idle" | "drawing" | "wait" | "void" | "fade";

const MIN_POINTS = 12;
const MIN_TRAVEL = 40;
/** Pause after lifting the pen before the signature is submitted (room for a second stroke). */
const SETTLE_MS = 650;

const f = (n: number) => n.toFixed(1);

function pathOf(strokes: Pt[][]): string {
  let d = "";
  for (const pts of strokes) {
    const first = pts[0];
    if (!first) continue;
    d += `M${f(first[0])} ${f(first[1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      d += `Q${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
    }
    const last = pts[pts.length - 1]!;
    if (pts.length > 1) d += `L${f(last[0])} ${f(last[1])}`;
  }
  return d;
}

/** A loose scribble across the line, for keyboard users and for taps. */
function scribble(w: number, h: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push([w * (0.06 + 0.66 * t) + Math.sin(t * 31) * 7, h * (0.58 - 0.2 * Math.sin(t * 13.5) * (1 - 0.5 * t)) + Math.cos(t * 31) * 4]);
  }
  return pts;
}

/**
 * The empty countersign line, and you can actually sign it: with a mouse, a finger, or Enter for a
 * scribble. Whatever you draw is still just ink. `onSign` runs the real contract check and resolves true
 * when it refused, and the ink gets struck through.
 */
export function InkPad({ onStart, onSign, nudge, disabled }: { onStart: () => void; onSign: () => Promise<boolean>; nudge: boolean; disabled: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pathEl = useRef<SVGPathElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const travel = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [bbox, setBbox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const later = useLater();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (settle.current) clearTimeout(settle.current);
    };
  }, []);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const redraw = () => pathEl.current?.setAttribute("d", pathOf(strokes.current));
  const reset = () => {
    strokes.current = [];
    travel.current = 0;
    redraw();
    setBbox(null);
    go("idle");
  };

  async function submit() {
    const all = strokes.current.flat();
    if (!all.length) return reset();
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    setBbox({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
    go("wait");
    const refused = await onSign().catch(() => false);
    if (!alive.current) return;
    if (!refused) return reset();
    go("void");
    later.after(2600, () => go("fade"));
    later.after(3200, reset);
  }

  async function playScribble() {
    const el = box.current;
    if (!el || disabled || phaseRef.current !== "idle") return;
    onStart();
    const r = el.getBoundingClientRect();
    const pts = scribble(r.width, r.height);
    go("drawing");
    if (prefersReducedMotion()) {
      strokes.current = [pts];
      redraw();
      return submit();
    }
    await new Promise<void>((done) => {
      let i = 0;
      const step = () => {
        if (!alive.current) return done();
        i = Math.min(pts.length, i + 3);
        strokes.current = [pts.slice(0, i)];
        redraw();
        if (i < pts.length) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    if (alive.current) await submit();
  }

  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = box.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    const p = phaseRef.current;
    if (disabled || (p !== "idle" && p !== "drawing")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (settle.current) {
      clearTimeout(settle.current);
      settle.current = null;
    }
    onStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    strokes.current.push([at(e)]);
    go("drawing");
    redraw();
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (phaseRef.current !== "drawing" || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const stroke = strokes.current.at(-1);
    if (!stroke) return;
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [native];
    for (const ev of events.length ? events : [native]) {
      const p = at(ev);
      const prev = stroke[stroke.length - 1]!;
      const dist = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (dist < 1.5) continue;
      travel.current += dist;
      stroke.push(p);
    }
    redraw();
  }

  function up(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (phaseRef.current !== "drawing") return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const points = strokes.current.reduce((n, s) => n + s.length, 0);
    if (points >= MIN_POINTS && travel.current >= MIN_TRAVEL) {
      settle.current = setTimeout(() => {
        settle.current = null;
        void submit();
      }, SETTLE_MS);
      return;
    }
    if (!cancelled && travel.current < 6 && strokes.current.length === 1) {
      // A tap, not a stroke: scribble for them.
      strokes.current = [];
      travel.current = 0;
      go("idle");
      void playScribble();
      return;
    }
    reset();
  }

  return (
    <div
      ref={box}
      className={`inkpad ${phase}${nudge && phase === "idle" ? " nudge" : ""}${disabled ? " off" : ""}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={(e) => up(e, false)}
      onPointerCancel={(e) => up(e, true)}
    >
      <svg className="ink" aria-hidden="true">
        <path ref={pathEl} />
      </svg>
      {bbox && (phase === "void" || phase === "fade") ? (
        <PenMark kind="strike" className="is-playing ink-strike" style={{ left: bbox.x - 8, top: bbox.y + bbox.h / 2 - 9, width: bbox.w + 16, height: 18 }} />
      ) : null}
      {phase === "idle" ? (
        <button
          type="button"
          className="sig-empty"
          aria-label="Sign here by hand (the contract checks it)"
          disabled={disabled}
          onClick={(e) => {
            if (e.detail === 0) void playScribble();
          }}
        >
          ✎ sign here
        </button>
      ) : null}
    </div>
  );
}
