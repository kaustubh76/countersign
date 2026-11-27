"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

/** Read only in effects and event handlers (never during render), so server and client markup match. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** True while at least `threshold` of the element is on screen. */
export function useVisible(ref: RefObject<Element | null>, threshold = 0.5): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return visible;
}

/** Timeouts that die with the component; `clear()` cancels a running sequence when a new one starts. */
export function useLater() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach(clearTimeout);
      set.clear();
    };
  }, []);
  return useMemo(
    () => ({
      after(ms: number, fn: () => void) {
        const t = setTimeout(() => {
          timers.current.delete(t);
          fn();
        }, ms);
        timers.current.add(t);
      },
      clear() {
        timers.current.forEach(clearTimeout);
        timers.current.clear();
      },
    }),
    [],
  );
}

/**
 * A number that rolls to its new value. The duration follows the size of the jump unless `ms` is given;
 * reduced motion shows the new value at once. `from` makes a freshly mounted counter roll up from there.
 * Lives in its own component so each frame re-renders one span.
 */
export function Rolling({ value, from, ms, delay = 0 }: { value: number; from?: number; ms?: number; delay?: number }) {
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(from ?? value);
  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    if (prefersReducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    const duration = ms ?? Math.min(1300, Math.max(180, Math.abs(value - start) * 1.3));
    let raf = 0;
    let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const k = Math.min(1, (t - t0) / duration);
      const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
      current.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, ms, delay]);
  return <>{shown.toLocaleString("en-US")}</>;
}

/**
 * Plays its children's entrance once, when their top passes 80% of the viewport height (works for any
 * element height). Server HTML, anything already on screen at load, and reduced motion all show the
 * final state: the class goes none → "is-armed" → "is-playing".
 */
export function InView({ className, children, onPlay }: { className?: string; children: ReactNode; onPlay?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"idle" | "armed" | "play">("idle");
  const played = useRef(onPlay);
  useEffect(() => {
    played.current = onPlay;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.82 && r.bottom > 0) return;
    setPhase("armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setPhase("play");
        played.current?.();
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`${className ?? ""}${phase === "idle" ? "" : phase === "armed" ? " is-armed" : " is-playing"}`}>
      {children}
    </div>
  );
}
