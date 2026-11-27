"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { INITIAL_DUEL, sendBots, useForReal, type DuelEvent, type DuelState } from "@/lib/duel";
import { signature } from "@/lib/fonts";

function reduced() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Animate a number towards `target` (fast when bots pile on). */
function useRolling(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced()) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const v = Math.round(a + (target - a) * (1 - (1 - k) ** 3));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function Log({ e }: { e: DuelEvent | undefined }) {
  if (!e) return <span>Waiting for signatures.</span>;
  if (e.kind === "bots")
    return (
      <span>
        <b className="bad">✗ {e.count.toLocaleString("en-US")} × {e.error}()</b> · the contract refused every bot
      </span>
    );
  if (e.outcome === "counted")
    return (
      <span>
        <b className="ok">✓ counted</b> · {e.checks.map((c) => `${c.id} ${c.ok ? "✓" : "✗"}`).join("  ")}
      </span>
    );
  return (
    <span>
      <b className="bad">✗ {e.error}()</b> · one countersign per Agent ID
    </span>
  );
}

/** The hero: copy on the left (server-rendered children), the live certificate on the right. */
export function HeroDuel({ children }: { children: ReactNode }) {
  const [s, setS] = useState<DuelState>(INITIAL_DUEL);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ n: number; text: string } | null>(null);
  const certRef = useRef<HTMLDivElement>(null);
  const downloads = useRolling(s.downloads);
  const last = s.events.at(-1);

  async function act(kind: "bots" | "real") {
    setBusy(true);
    const r = certRef.current?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) certRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      const next = kind === "bots" ? await sendBots(s) : await useForReal(s);
      setS(next);
      const e = next.events.at(-1);
      if (e && (e.kind === "bots" || e.outcome !== "counted")) {
        setFlash({ n: next.events.length, text: e.kind === "bots" ? `Refused ×${e.count.toLocaleString("en-US")}` : "Refused" });
      } else setFlash(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-grid">
      <div className="hero-copy">{children}</div>
      <div className="hero-act">
        <div className="hero-actions">
          <button type="button" className="btn line" disabled={busy} onClick={() => void act("bots")}>
            Send 1,000 bots
          </button>
          <button type="button" className="btn seal" disabled={busy} onClick={() => void act("real")}>
            Use it for real
          </button>
        </div>
        <div className="hero-links">
          <Link href="/try">All 11 attacks →</Link>
          <Link href="/check">Check a skill →</Link>
        </div>
      </div>

      <div className="cert-wrap" ref={certRef}>
        <div className="paper certificate">
          <div className="cert-head">
            <span>Skill certificate</span>
            <span>BNB Smart Chain · demo</span>
          </div>
          <div className="cert-title">
            dca-planner <span>v1.2</span>
          </div>
          <div className="cert-id">version 0x9c61…e0fd</div>

          <div className="cert-rows">
            <div className="row-l">
              <span className="k">Downloads</span>
              <span className="leader" />
              <span className="v">{downloads.toLocaleString("en-US")}</span>
              <span className="tag">unverified</span>
            </div>
            <div className="row-l strong">
              <span className="k">Countersigns</span>
              <span className="leader" />
              <span className="v">{s.countersigns}</span>
              <span className="tag ok">verified</span>
            </div>
            {flash ? (
              <span key={flash.n} className="stamp bad flash">
                {flash.text}
              </span>
            ) : null}
          </div>

          <div className="cert-sign">
            <div>
              <div className="sig-line">
                <span className={`sig ${signature.className}`}>Alice</span>
              </div>
              <div className="sig-cap">Author · Agent ID #1</div>
            </div>
            <div>
              <div className="sig-line">
                {s.signed ? <span className={`sig writing ${signature.className}`}>You</span> : <span className="sig-empty">sign here</span>}
              </div>
              <div className="sig-cap">Countersigned by</div>
            </div>
          </div>

          {s.signed ? (
            <span className="stamp ok big landed" aria-label="verified">
              Verified ✓
            </span>
          ) : null}

          <div className="cert-log" aria-live="polite">
            <Log e={last} />
          </div>
        </div>
        <p className="demo-note">Demo: made-up downloads. Every verdict is the real verifier on a simulated chain.</p>
      </div>
    </div>
  );
}
