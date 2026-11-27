"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { botTraffic, INITIAL_DUEL, loadSim, sendBots, signWithInk, useForReal, type DuelEvent, type DuelState } from "@/lib/duel";
import { signature } from "@/lib/fonts";
import { prefersReducedMotion, Rolling, useLater, useVisible } from "@/lib/motion";
import { pen } from "@/lib/penFont";
import { BotSwarm } from "./BotSwarm";
import { InkPad } from "./InkPad";
import { PenMark } from "./PenMark";
import { Seal } from "./Seal";

type Act = "bots" | "real" | "ink";

/** Attract mode: about 18 s of made-up bot downloads, then the signature line nudges. */
const ATTRACT_TICKS = 70;
const STILL_ZERO_AT = 15;
/** The real-use timeline (ms): txs, signature, checks, count, seal. */
const T = { sig: 450, checks: 900, step: 150, count: 1650, swarm: 1300, strike: 1600 };

const fmt = (n: number) => n.toLocaleString("en-US");
const t = (ms: number) => ({ ["--t" as string]: `${ms}ms` }) as CSSProperties;

function refusalOf(e: DuelEvent | undefined): string | null {
  if (!e) return null;
  if (e.kind === "bots") return `Refused ×${fmt(e.count)}`;
  if (e.kind === "ink") return "Void";
  return e.outcome === "counted" ? null : "Refused";
}

function spoken(e: DuelEvent | undefined, s: DuelState): string {
  if (!e) return "";
  if (e.kind === "bots") return `${fmt(e.count)} bot countersigns refused: ${e.error}. Countersigns: ${s.countersigns}.`;
  if (e.kind === "ink") return `Hand-drawn signature refused: ${e.error}. Ink isn't a countersign.`;
  if (e.outcome === "counted") return `Counted. Checks C1 to C5 passed. Countersigns: ${s.countersigns}.`;
  return `Refused: ${e.error}. One countersign per Agent ID.`;
}

function LogLine({ e, refused }: { e: DuelEvent | undefined; refused: number }) {
  if (!e) return null;
  if (e.kind === "bots")
    return (
      <div>
        <b className="bad">
          ✗ <Rolling from={refused - e.count} value={refused} ms={T.swarm} /> refused
        </b>{" "}
        · {e.error}() · no Agent ID
      </div>
    );
  if (e.kind === "ink")
    return (
      <div>
        <b className="bad">✗ {e.error}()</b> · ink isn&apos;t a countersign
      </div>
    );
  if (e.outcome !== "counted")
    return (
      <div>
        <b className="bad">✗ {e.error}()</b> · one per Agent ID
      </div>
    );
  return (
    <>
      {e.txs.map((tx, i) => (
        <div key={i} className="log-tx" style={t(i * 200)}>
          ↳ {tx.what}
          {i === e.txs.length - 1 ? ` · ${tx.when}` : ""}
        </div>
      ))}
      <div>
        {e.checks.map((c, i) => (
          <span key={c.id} className="log-tick" style={t(T.checks + i * T.step)}>
            {c.id} {c.ok ? "✓" : "✗"}{" "}
          </span>
        ))}
        <b className="ok log-tick" style={t(T.count)}>
          · counted
        </b>
      </div>
    </>
  );
}

/**
 * The hero: a skill certificate you can attack. Bots inflate its downloads (even while you watch), but
 * its countersign count only moves for a real Agent ID with its own session. Every verdict is the real
 * verifier on a simulated chain (lib/duel.ts).
 */
export function HeroDuel({ title, lede, versionLabel }: { title: ReactNode; lede: ReactNode; versionLabel: string }) {
  const [s, setS] = useState<DuelState>(INITIAL_DUEL);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scene, setScene] = useState(0);
  const [motion, setMotion] = useState(false);
  const [idle, setIdle] = useState(true);
  const [attract, setAttract] = useState(0);
  const [floaters, setFloaters] = useState<{ id: number; n: number }[]>([]);
  const [stillZero, setStillZero] = useState(false);
  const [struck, setStruck] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [pageShown, setPageShown] = useState(true);
  const paper = useRef<HTMLDivElement>(null);
  const ticks = useRef(0);
  const floaterId = useRef(0);
  const later = useLater();
  const visible = useVisible(paper, 0.5);
  const last = s.events.at(-1);
  const counted = last?.kind === "real" && last.outcome === "counted";
  const refusal = refusalOf(last);

  // Motion preference and the simulator chunk (fetched while the visitor reads the headline).
  useEffect(() => {
    setMotion(!prefersReducedMotion());
    const warm = () => void loadSim().catch(() => undefined);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 2500);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const on = () => setPageShown(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Attract mode: made-up bot traffic while the certificate is on screen, until the first interaction.
  useEffect(() => {
    if (!idle || !visible || !pageShown || ticks.current >= ATTRACT_TICKS || prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      ticks.current += 1;
      const n = 1 + Math.floor(Math.random() * 6);
      setS((p) => botTraffic(p, n));
      setAttract((a) => a + n);
      const id = ++floaterId.current;
      setFloaters((f) => [...f.slice(-3), { id, n }]);
      if (ticks.current === STILL_ZERO_AT) setStillZero(true);
      if (ticks.current >= ATTRACT_TICKS) {
        setNudge(true);
        return;
      }
      timer = setTimeout(tick, 140 + Math.random() * 240);
    };
    timer = setTimeout(tick, ticks.current === 0 ? 600 : 250);
    return () => clearTimeout(timer);
  }, [idle, visible, pageShown]);

  const jolt = () => {
    const el = paper.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ translate: "0 0" }, { translate: "-5px 2px" }, { translate: "4px -2px" }, { translate: "-2px 1px" }, { translate: "0 0" }], { duration: 300, easing: "ease-out" });
  };

  const stop = () => {
    setIdle(false);
    setNudge(false);
    setFloaters([]);
  };

  async function act(kind: Act): Promise<boolean> {
    if (busy) return false;
    stop();
    setBusy(true);
    setFailed(false);
    later.clear();
    const box = paper.current?.getBoundingClientRect();
    if (kind !== "ink" && box && (box.top < 70 || box.bottom > window.innerHeight))
      paper.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    try {
      const next = kind === "bots" ? await sendBots(s) : kind === "real" ? await useForReal(s) : await signWithInk(s);
      const e = next.events.at(-1)!;
      setS(next);
      setScene((n) => n + 1);
      const reduced = prefersReducedMotion();
      if (e.kind === "bots") {
        later.after(reduced ? 0 : T.swarm, jolt);
        later.after(reduced ? 0 : T.strike, () => {
          setStruck(true);
          if (next.countersigns === 0) setStillZero(true);
        });
      } else if (e.kind === "real" && e.outcome === "counted") {
        later.after(reduced ? 0 : T.count, () => setStillZero(false));
      } else if (e.kind === "real") {
        jolt();
      }
      return e.kind !== "real" || e.outcome !== "counted";
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const warm = () => void loadSim().catch(() => undefined);
  const botsUsed = s.events.some((e) => e.kind === "bots");

  return (
    <div className="hero-grid">
      <div className="hero-head">{title}</div>
      <div className="hero-lede">{lede}</div>
      <div className="hero-act">
        <div className="hero-actions">
          <button type="button" className="btn line" disabled={busy} onPointerEnter={warm} onFocus={warm} onClick={() => void act("bots")}>
            {botsUsed ? "Send 1,000 more" : "Send 1,000 bots"}
          </button>
          <button type="button" className="btn seal" disabled={busy} onPointerEnter={warm} onFocus={warm} onClick={() => void act("real")}>
            {s.signed ? "Use it again" : "Use it for real"}
          </button>
        </div>
        <div className="hero-links">
          <Link href="/try">All 11 attacks →</Link>
          <Link href="/check">Check a skill →</Link>
        </div>
      </div>

      <div className="cert-wrap">
        <div className={`paper certificate${s.signed ? " signed" : ""}`} ref={paper}>
          <div className="cert-head">
            <span>Skill certificate</span>
            <span>BNB Smart Chain · demo</span>
          </div>
          <div className="cert-title">
            dca-planner <span>v1.2</span>
          </div>
          <div className="cert-id">version {versionLabel}</div>
          {s.signed ? (
            <span className="cert-seal" aria-hidden="true">
              <Seal id="cert-seal" size={92} color="currentColor" ringText="COUNTERSIGNED · VERIFIED ON-CHAIN · " />
            </span>
          ) : null}

          <div className="cert-rows">
            <div className="row-l">
              <span className="k">Downloads</span>
              <span className="leader" />
              <span className="v marked">
                <Rolling value={s.downloads} />
                {motion
                  ? floaters.map((fl) => (
                      <span key={fl.id} className="floater" data-n={`+${fl.n}`} style={{ right: `${(fl.id % 3) * 14 - 6}px` }} aria-hidden="true" />
                    ))
                  : null}
                {struck ? <PenMark kind="strike" className="is-playing struck" /> : null}
              </span>
              <span className="tag">unverified</span>
            </div>
            <div className="row-l strong">
              <span className="k">Countersigns</span>
              <span className="leader" />
              <span className="v marked">
                <Rolling value={s.countersigns} ms={320} delay={counted ? T.count : 0} />
                {stillZero ? (
                  <>
                    <PenMark kind="circle" className="is-playing zero-ring" />
                    <span className={`pen-note zero-note ${pen.className}`} aria-hidden="true">
                      still 0
                    </span>
                  </>
                ) : null}
              </span>
              <span className="tag ok">verified</span>
            </div>
          </div>

          <div className="cert-sign">
            <div className="sig-col">
              <div className="sig-line">
                <span className={`sig ${signature.className}`}>Alice</span>
              </div>
              <div className="sig-cap">Author · Agent ID #1</div>
            </div>
            <div className="sig-col you">
              <div className="sig-line">
                {s.signed ? (
                  <span className={`sig ${counted ? "writing" : ""} ${signature.className}`} style={t(T.sig)}>
                    You
                  </span>
                ) : (
                  <InkPad nudge={nudge} disabled={busy} onStart={stop} onSign={() => act("ink")} />
                )}
              </div>
              <div className="sig-cap">Countersigned by</div>
              {motion && last?.kind === "bots" ? <BotSwarm key={scene} count={56} seed={scene * 7919 + 17} /> : null}
              {refusal ? (
                <span key={scene} className={`stamp bad big refusal${last?.kind === "ink" ? " ink" : ""}`} style={t(last?.kind === "bots" && motion ? T.swarm : 0)}>
                  {refusal}
                </span>
              ) : null}
            </div>
          </div>

          <div className="cert-log" aria-hidden={last ? true : undefined}>
            {failed ? (
              <div>
                <b className="bad">Couldn&apos;t load the verifier.</b> Try again.
              </div>
            ) : last ? (
              <LogLine key={scene} e={last} refused={s.refused} />
            ) : (
              <div className="log-idle">{attract ? `made-up bot traffic · +${fmt(attract)}` : "Waiting for signatures."}</div>
            )}
          </div>
          <div className="sr-only" aria-live="polite">
            {spoken(last, s)}
          </div>
        </div>
        <p className="demo-note">Demo: made-up downloads, real verifier, simulated chain.</p>
      </div>
    </div>
  );
}
