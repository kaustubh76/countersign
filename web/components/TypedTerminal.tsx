"use client";

import { useEffect, useRef, useState } from "react";

export interface TermLine {
  text: string;
  cls?: "p" | "bad" | "warn" | "ok" | "dim";
}

/** Types its lines out once it scrolls into view (instant with reduced motion). */
export function TypedTerminal({ lines, label }: { lines: TermLine[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(lines.length);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setShown(0);
    setChars(0);
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let line = 0;
        let c = 0;
        timer = setInterval(() => {
          const cur = lines[line];
          if (!cur) {
            clearInterval(timer);
            return;
          }
          c += line === 0 ? 2 : 6;
          if (c >= cur.text.length) {
            line += 1;
            c = 0;
            setShown(line);
            setChars(0);
          } else setChars(c);
        }, 28);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [lines]);

  return (
    <div className="term" ref={ref}>
      <div className="term-head">
        <span className="term-dots" aria-hidden="true">
          ● ● ●
        </span>
        <span>{label}</span>
      </div>
      <pre aria-label={lines.map((l) => l.text).join("\n")}>
        {lines.slice(0, shown).map((l, i) => (
          <span key={i} className={l.cls}>
            {l.text}
            {"\n"}
          </span>
        ))}
        {shown < lines.length ? (
          <span className={lines[shown]?.cls}>
            {lines[shown]?.text.slice(0, chars)}
            <span className="cursor" />
          </span>
        ) : (
          <span className="cursor" />
        )}
      </pre>
    </div>
  );
}
