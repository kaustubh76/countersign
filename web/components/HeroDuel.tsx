"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { botTraffic, INITIAL_DUEL, loadSim, sendBots, shareText, signWithInk, useForReal, type DuelEvent, type DuelState } from "@/lib/duel";
import { signature } from "@/lib/fonts";
import { prefersReducedMotion, Rolling, useLater, useVisible } from "@/lib/motion";
import { pen } from "@/lib/penFont";
import { SITE_URL } from "@/lib/site";
import { isEditable, shortcutFor, TOUR, tourSpan, type TourStep } from "@/lib/tour";
import { LEDGER_TOUR_EVENT } from "./AttackLedger";
import { BotSwarm } from "./BotSwarm";
import { InkPad, type InkPadHandle } from "./InkPad";
import { PenMark } from "./PenMark";
import { Seal } from "./Seal";

type Act = "bots" | "real" | "ink";

/** Attract mode: about 18 s of made-up bot downloads, then the signature line nudges. */
const ATTRACT_TICKS = 70;
const STILL_ZERO_AT = 15;
/** The real-use timeline (ms): txs, signature, checks, count, seal. */
const T = { sig: 450, checks: 900, step: 150, count: 1650, swarm: 1300, strike: 1600 };
/** The tour lets a smooth scroll get going before the ledger starts stamping. */
const SCROLL_LEAD = 500;

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
  const [circled, setCircled] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [pageShown, setPageShown] = useState(true);
  const [tilt, setTilt] = useState(false);
  /** The tour step on screen, or null when the tour isn't playing. */
  const [tour, setTour] = useState<number | null>(null);
  /** Bumped when the tour resets the certificate, so the signature line starts clean too. */
  const [epoch, setEpoch] = useState(0);
  const paper = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const ink = useRef<InkPadHandle>(null);
  const ticks = useRef(0);
  const floaterId = useRef(0);
  // The latest state and busy flag, for anything that acts across renders (the tour, keys, attract mode).
  const sRef = useRef<DuelState>(INITIAL_DUEL);
  const busyRef = useRef(false);
  const idleRef = useRef(true);
  // The tour: a run id (bumped to cancel) and the wake-ups of its pending pauses.
  const tourRun = useRef(0);
  const wakers = useRef(new Set<() => void>());
  const handlers = useRef({ key: (_e: KeyboardEvent) => {}, watch: () => {} });
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
  // The first tick waits for the paper to land (the cert-land CSS animation).
  useEffect(() => {
    if (!idle || !visible || !pageShown || ticks.current >= ATTRACT_TICKS || prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const tick = () => {
      if (!idleRef.current) return;
      ticks.current += 1;
      const n = 1 + Math.floor(Math.random() * 6);
      sRef.current = botTraffic(sRef.current, n);
      setS(sRef.current);
      setAttract((a) => a + n);
      const id = ++floaterId.current;
      setFloaters((f) => [...f.slice(-3), { id, n }]);
      if (ticks.current === STILL_ZERO_AT) setCircled(true);
      if (ticks.current >= ATTRACT_TICKS) {
        setNudge(true);
        return;
      }
      timer = setTimeout(tick, 140 + Math.random() * 240);
    };
    const start = () => {
      if (!cancelled) timer = setTimeout(tick, ticks.current === 0 ? 300 : 250);
    };
    const landing = paper.current
      ?.getAnimations?.()
      .find((a) => "animationName" in a && (a as CSSAnimation).animationName === "cert-land");
    if (ticks.current === 0 && landing && landing.playState !== "finished") landing.finished.then(start, start);
    else start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [idle, visible, pageShown]);

  // Desktop: the paper tilts toward the cursor (flat while someone is signing on it).
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 981px)");
    const update = () => setTilt(mq.matches && !prefersReducedMotion());
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const w = wrap.current;
    const p = paper.current;
    if (!tilt || !w || !p) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!last) return;
      const r = w.getBoundingClientRect();
      const flat = last.buttons !== 0 || (last.target instanceof Element && last.target.closest(".sig-col.you") !== null);
      const dx = Math.max(-1, Math.min(1, (last.clientX - r.left - r.width / 2) / (r.width / 2)));
      const dy = Math.max(-1, Math.min(1, (last.clientY - r.top - r.height / 2) / (r.height / 2)));
      p.style.setProperty("--ry", flat ? "0deg" : `${(dx * 4).toFixed(2)}deg`);
      p.style.setProperty("--rx", flat ? "0deg" : `${(-dy * 3).toFixed(2)}deg`);
      p.style.setProperty("--gx", `${(((last.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      p.style.setProperty("--gy", `${(((last.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const move = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    w.addEventListener("pointermove", move);
    w.addEventListener("pointerdown", move);
    return () => {
      w.removeEventListener("pointermove", move);
      w.removeEventListener("pointerdown", move);
      cancelAnimationFrame(raf);
    };
  }, [tilt]);

  const jolt = () => {
    const el = paper.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ translate: "0 0" }, { translate: "-5px 2px" }, { translate: "4px -2px" }, { translate: "-2px 1px" }, { translate: "0 0" }], { duration: 300, easing: "ease-out" });
  };

  const stop = () => {
    idleRef.current = false;
    setIdle(false);
    setNudge(false);
    setFloaters([]);
  };

  const offScreen = () => {
    const box = paper.current?.getBoundingClientRect();
    return Boolean(box && (box.top < 70 || box.bottom > window.innerHeight));
  };
  const scrollTo = (el: Element | null | undefined) => el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });

  async function act(kind: Act): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    stop();
    setBusy(true);
    setFailed(false);
    later.clear();
    if (kind !== "ink" && offScreen()) scrollTo(paper.current);
    try {
      const cur = sRef.current;
      const next = kind === "bots" ? await sendBots(cur) : kind === "real" ? await useForReal(cur) : await signWithInk(cur);
      const e = next.events.at(-1)!;
      sRef.current = next;
      setS(next);
      setScene((n) => n + 1);
      const reduced = prefersReducedMotion();
      if (e.kind === "bots") later.after(reduced ? 0 : T.swarm, jolt);
      else if (e.kind === "real" && e.outcome !== "counted") jolt();
      return e.kind !== "real" || e.outcome !== "counted";
    } catch {
      setFailed(true);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // ── "Watch it": the whole landing plays itself; any scroll, tap or key hands it back ─────────
  /** A pause the tour can cut short: ending the tour wakes every pending pause, so nothing hangs. */
  const pause = (ms: number) =>
    new Promise<void>((done) => {
      const wake = () => {
        clearTimeout(timer);
        wakers.current.delete(wake);
        done();
      };
      const timer = setTimeout(wake, ms);
      wakers.current.add(wake);
    });

  const endTour = () => {
    tourRun.current += 1;
    wakers.current.forEach((wake) => wake());
    setTour(null);
  };

  async function play(step: TourStep) {
    switch (step.id) {
      case "bots":
        return void (await act("bots"));
      case "ink":
        return ink.current?.scribble();
      case "real":
      case "again":
        return void (await act("real"));
      case "ledger":
        scrollTo(document.getElementById("attacks"));
        await pause(prefersReducedMotion() ? 0 : SCROLL_LEAD);
        return void window.dispatchEvent(new Event(LEDGER_TOUR_EVENT));
      case "receipt":
        return scrollTo(document.querySelector(".receipt"));
      case "blocked":
        return scrollTo(document.querySelector(".redacted"));
      case "close":
        return scrollTo(document.getElementById("your-move"));
    }
  }

  async function watch() {
    endTour();
    const run = tourRun.current;
    const live = () => tourRun.current === run;
    setTour(0);
    // A clean certificate, so the story always reads the same (the download count carries on).
    stop();
    later.clear();
    ticks.current = ATTRACT_TICKS;
    while (busyRef.current && live()) await pause(60);
    if (!live()) return;
    sRef.current = { ...INITIAL_DUEL, downloads: sRef.current.downloads };
    setS(sRef.current);
    setScene((n) => n + 1);
    setEpoch((n) => n + 1);
    setCircled(false);
    setAttract(0);
    setFailed(false);
    if (offScreen()) {
      scrollTo(paper.current);
      await pause(prefersReducedMotion() ? 0 : 700);
    }
    for (let i = 0; i < TOUR.length; i++) {
      if (!live()) return;
      setTour(i);
      await play(TOUR[i]!);
      if (!live()) return;
      await pause(TOUR[i]!.ms);
    }
    if (live()) setTour(null);
  }

  useEffect(() => {
    handlers.current = {
      watch: () => void watch(),
      key: (e) => {
        const k = shortcutFor({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat, editable: isEditable(e.target) });
        if (!k) return;
        if (k === "stop") return void (tour !== null && endTour());
        if (k === "watch") {
          e.preventDefault();
          return tour !== null ? endTour() : void watch();
        }
        // B, S and R only while the certificate is on screen.
        if (!visible || busyRef.current) return;
        e.preventDefault();
        if (k === "ink") void ink.current?.scribble();
        else void act(k);
      },
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handlers.current.key(e);
    window.addEventListener("keydown", onKey);
    // /?watch (and /watch, which redirects here) starts the tour once the paper has landed.
    const auto = new URLSearchParams(window.location.search).has("watch") ? setTimeout(() => handlers.current.watch(), 1100) : undefined;
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(auto);
      tourRun.current += 1;
      wakers.current.forEach((wake) => wake());
    };
  }, []);

  // While the tour plays, the visitor taking over (scroll, tap, click, a key, leaving the tab) ends it.
  // Its own controls are exempt, so Stop doesn't end it and then restart it on the same click.
  const touring = tour !== null;
  useEffect(() => {
    if (!touring) return;
    const own = (t: EventTarget | null) => t instanceof Element && t.closest("[data-tour-ctl]") !== null;
    const takeover = (e: Event) => {
      if (own(e.target)) return;
      if (e instanceof KeyboardEvent && e.key.toLowerCase() === "w") return;
      endTour();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") endTour();
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    const types = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    types.forEach((t) => window.addEventListener(t, takeover, opts));
    document.addEventListener("visibilitychange", hidden);
    return () => {
      types.forEach((t) => window.removeEventListener(t, takeover, opts));
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [touring]);

  const warm = () => void loadSim().catch(() => undefined);
  const botsUsed = s.events.some((e) => e.kind === "bots");
  // The red pen marks come from state that never resets, timed with CSS delays (a quick second click
  // can't cancel them). "still 0" fades out when a real countersign rolls the count to 1.
  const ringOn = (circled || botsUsed) && (!s.signed || counted);
  const ringDelay = circled ? 0 : T.strike;
  const played = s.events.length > 0;

  return (
    <div className={`hero-grid${tilt ? " tilt" : ""}`}>
      <div className={`hero-head${botsUsed ? " h-struck" : ""}${s.signed ? " h-checked" : ""}`}>{title}</div>
      <div className="hero-lede">{lede}</div>
      <div className="hero-act">
        <div className="hero-actions">
          <button type="button" className="btn line" disabled={busy} data-key="B" aria-keyshortcuts="B" onPointerEnter={warm} onFocus={warm} onClick={() => void act("bots")}>
            {botsUsed ? "Send 1,000 more" : "Send 1,000 bots"}
          </button>
          <button type="button" className="btn seal" disabled={busy} data-key="R" aria-keyshortcuts="R" onPointerEnter={warm} onFocus={warm} onClick={() => void act("real")}>
            {s.signed ? "Use it again" : "Use it for real"}
          </button>
        </div>
        <div className="hero-links">
          <button
            type="button"
            className={`watch${touring ? " on" : ""}`}
            data-tour-ctl=""
            data-key="W"
            aria-keyshortcuts="W"
            title={touring ? "Stop (Esc)" : "Plays the page in about 20 seconds"}
            onPointerEnter={warm}
            onFocus={warm}
            onClick={() => (touring ? endTour() : void watch())}
          >
            {touring ? "Stop" : "Watch it"}
          </button>
          <Link href="/try">All 11 attacks →</Link>
        </div>
      </div>

      <div className="cert-wrap" ref={wrap}>
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
                {botsUsed ? <PenMark kind="strike" className="is-playing struck" delay={T.strike} /> : null}
              </span>
              <span className="tag">unverified</span>
            </div>
            <div className="row-l strong">
              <span className="k">Countersigns</span>
              <span className="leader" />
              <span className="v marked">
                <Rolling value={s.countersigns} ms={320} delay={counted ? T.count : 0} />
                {ringOn ? (
                  <>
                    <PenMark kind="circle" className={`is-playing zero-ring${s.signed ? " out" : ""}`} delay={ringDelay} />
                    <span className={`pen-note zero-note${s.signed ? " out" : ""} ${pen.className}`} style={{ ["--zd" as string]: `${ringDelay}ms` }} aria-hidden="true">
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
                  <InkPad key={`ink-${epoch}`} ref={ink} nudge={nudge} disabled={busy} onStart={stop} onSign={() => act("ink")} />
                )}
              </div>
              <div className="sig-cap">Countersigned by</div>
              {motion && last?.kind === "bots" ? <BotSwarm key={`swarm-${scene}`} count={56} seed={scene * 7919 + 17} /> : null}
              {refusal ? (
                <span key={`stamp-${scene}`} className={`stamp bad big refusal${last?.kind === "ink" ? " ink" : ""}`} style={t(last?.kind === "bots" && motion ? T.swarm : 0)}>
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
        <div className="cert-foot">
          <p className="demo-note">Demo: made-up downloads, real verifier, simulated chain.</p>
          <a
            className={`textlink share-link${played ? " on" : ""}`}
            href={`https://x.com/intent/post?text=${encodeURIComponent(shareText(s))}&url=${encodeURIComponent(SITE_URL)}`}
            target="_blank"
            rel="noreferrer"
          >
            Share ↗
          </a>
        </div>
      </div>

      {tour !== null ? (
        <div className="paper tour" data-tour-ctl="">
          <span className="tour-n">
            {tour + 1}/{TOUR.length}
          </span>
          <span className="tour-cap">{TOUR[tour]!.cap}</span>
          <button type="button" className="tour-stop" aria-label="Stop the tour (Esc)" onClick={endTour}>
            Stop
          </button>
          <span
            key={`bar-${tour}`}
            className="tour-bar"
            aria-hidden="true"
            style={{ ["--from" as string]: tourSpan(tour).from, ["--to" as string]: tourSpan(tour).to, ["--dur" as string]: `${TOUR[tour]!.ms}ms` } as CSSProperties}
          />
        </div>
      ) : null}
    </div>
  );
}
