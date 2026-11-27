"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { badgeSvg } from "@/lib/badge";
import { REASON_TEXT, SCENARIOS, type Outcome, type Scenario, type ScenarioResult, type TraceStep } from "@/lib/sim/scenarios";
import { ACTORS, ago, FN_NAMES, labelOf, manifestJson } from "@/lib/sim/world";
import { SITE_URL } from "@/lib/site";

const GROUPS: { key: Scenario["group"]; title: string; note: string }[] = [
  { key: "fake", title: "Fake it", note: "Raise the badge without real use" },
  { key: "real", title: "Use it for real", note: "The only thing that counts" },
  { key: "author", title: "Catch the author", note: "It works on authors too" },
];

export const VERDICT: Record<Outcome, { icon: string; label: string; cls: string }> = {
  reverted: { icon: "✗", label: "Reverted on-chain. Nothing was recorded.", cls: "bad" },
  rejected: { icon: "✗", label: "Recorded, but rejected: it does not count.", cls: "bad" },
  peer: { icon: "◐", label: "Peer countersign: shown separately, never counted.", cls: "warn" },
  claim: { icon: "!", label: "An unverified claim: shown, never decisive.", cls: "warn" },
  warning: { icon: "!", label: "Flagged: not the canonical version.", cls: "warn" },
  counted: { icon: "✓", label: "Counted. The badge goes up.", cls: "ok" },
  incident: { icon: "✗", label: "Verified incident. The badge turns red.", cls: "bad" },
};

const STEP_ICON: Record<TraceStep["state"], string> = { pass: "✓", fail: "✗", warn: "!", skip: "–", info: "i" };

export const badgeUri = (r: ScenarioResult["report"]) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(badgeSvg({ counted: r.countersigns.counted, incidents: r.incidents.length, status: r.status }))}`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function Trace({ steps, revealed = Infinity }: { steps: TraceStep[]; revealed?: number }) {
  return (
    <ol className="trace">
      {steps.map((s, i) => (
        <li key={s.id} className={`step-${s.state} ${i < revealed ? "shown" : ""}`}>
          <span className="ti" aria-hidden="true">
            {STEP_ICON[s.state]}
          </span>
          <div>
            <div className="tt">{s.title}</div>
            {s.detail.map((d, j) => (
              <div key={j} className="td">
                {d}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TxTable({ rows }: { rows: ScenarioResult["txs"] }) {
  if (rows.length === 0) return <p className="muted small">No transactions are cited in this scenario.</p>;
  return (
    <div className="table-wrap">
      <table className="txs">
        <thead>
          <tr>
            <th>When</th>
            <th>Sent by</th>
            <th>Called</th>
            <th>Effects</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tx, reasons }) => (
            <tr key={tx.hash}>
              <td className="nowrap">{ago(tx.block)}</td>
              <td>{labelOf(tx.from)}</td>
              <td>
                {labelOf(tx.to)}
                <div className="fn">
                  {FN_NAMES[tx.input.slice(0, 10)] ?? tx.input.slice(0, 10)}
                  {tx.status === "reverted" ? <span className="reason-bad"> · reverted</span> : null}
                </div>
              </td>
              <td>
                {tx.effects.map((e) => (
                  <div key={e}>{e}</div>
                ))}
                {reasons.map((r) => (
                  <div key={r} className="reason-bad">
                    ✗ {REASON_TEXT[r] ?? r}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Playground() {
  const [selected, setSelected] = useState<string>("bot-farm");
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [revealed, setRevealed] = useState(0);
  const [busy, setBusy] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const scenario = SCENARIOS.find((s) => s.id === selected) ?? SCENARIOS[0]!;
  const result = results[scenario.id];

  const run = useCallback(async (id: string, scroll = false) => {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setSelected(id);
    setBusy(true);
    setRevealed(0);
    if (timer.current) clearInterval(timer.current);
    window.history.replaceState(null, "", `?s=${id}`);
    const r = await s.run();
    setResults((prev) => ({ ...prev, [id]: r }));
    setBusy(false);
    const total = r.steps.length + 1;
    if (prefersReducedMotion()) setRevealed(total);
    else {
      let n = 0;
      timer.current = setInterval(() => {
        n += 1;
        setRevealed(n);
        if (n >= total && timer.current) clearInterval(timer.current);
      }, 260);
    }
    if (scroll && detailRef.current) {
      const top = detailRef.current.getBoundingClientRect().top;
      if (window.innerWidth < 900 || top < 0) detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("s");
    void run(id && SCENARIOS.some((s) => s.id === id) ? id : "bot-farm");
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [run]);

  const fakes = SCENARIOS.filter((s) => s.group === "fake");
  const tried = fakes.filter((s) => results[s.id]).length;
  const fakeCounted = fakes.filter((s) => results[s.id]?.outcome === "counted").length;
  const shareText = `I tried ${tried} ways to fake proof of use on COUNTERSIGN. ${fakeCounted} got counted.`;
  const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(`${SITE_URL}/try`)}`;
  const verdictShown = result && revealed > result.steps.length;
  const v = result ? VERDICT[result.outcome] : null;

  const manifest = useMemo(() => JSON.stringify(manifestJson(), null, 2), []);

  return (
    <>
      <div className="wrap">
        <div className="scorebar card flat">
          <div className="score">
            <div className="score-n">
              {tried}
              <span>/{fakes.length}</span>
            </div>
            <div className="score-l">fake attempts tried</div>
          </div>
          <div className="score">
            <div className={`score-n ${fakeCounted ? "bad" : "ok"}`}>{fakeCounted}</div>
            <div className="score-l">of them got counted</div>
          </div>
          <div className="score badge-now">
            {result ? <img src={badgeUri(result.report)} alt="dca-planner's countersign badge after this attempt" height={20} /> : null}
            <div className="score-l">dca-planner&apos;s badge</div>
          </div>
          <div className="spacer" />
          {tried >= 3 ? (
            <a className="btn small ghost" href={shareUrl} target="_blank" rel="noreferrer">
              Share your score ↗
            </a>
          ) : (
            <span className="tiny faint">try 3 to share your score</span>
          )}
        </div>
      </div>

      <div className="wrap play">
        <aside className="rail" aria-label="Scenarios">
          {GROUPS.map((g) => (
            <div key={g.key} className="rail-group">
              <div className="rail-head">
                <span>{g.title}</span>
                <span className="faint">{g.note}</span>
              </div>
              {SCENARIOS.filter((s) => s.group === g.key).map((s) => {
                const r = results[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`rail-item ${s.id === selected ? "active" : ""} ${r ? `done-${VERDICT[r.outcome].cls}` : ""}`}
                    aria-pressed={s.id === selected}
                    onClick={() => void run(s.id, true)}
                  >
                    <span className="ri-title">{s.title}</span>
                    <span className="ri-stop">{r ? `${VERDICT[r.outcome].icon} ${s.stoppedBy}` : "?"}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <details className="manifest-peek">
            <summary>What dca-planner declared (countersign.json)</summary>
            <pre>{manifest}</pre>
          </details>
        </aside>

        <div className="detail">
          <div className="card detail-card" ref={detailRef}>
            <div className="row tight">
              <span className="pill seal">{ACTORS[scenario.actor].name}</span>
              <span className="tiny muted">{ACTORS[scenario.actor].role}</span>
            </div>
            <h2 className="detail-title">{scenario.title}</h2>
            <p className="lead small-lead">{scenario.attempt}</p>

            <h4 className="sub">On the simulated chain</h4>
            {result ? <TxTable rows={result.txs} /> : <p className="muted small">Running…</p>}

            <h4 className="sub">
              What the verifier checks <span className="faint">· countersign.ruleset/v1, running in your browser</span>
            </h4>
            {result ? <Trace steps={result.steps} revealed={revealed} /> : null}

            <div className={`verdict ${v?.cls ?? ""} ${verdictShown ? "shown" : ""}`} aria-live="polite">
              {result && v ? (
                <>
                  <div className="verdict-line">
                    <span className="vi">{v.icon}</span>
                    {result.revert ? `Reverted: ${result.revert.error}()` : v.label}
                  </div>
                  {result.revert ? <div className="muted small">{v.label}</div> : null}
                  <p className="lesson">{scenario.lesson}</p>
                  <div className="row tight">
                    <img src={badgeUri(result.report)} alt="badge after this attempt" height={20} />
                    <span className="tiny faint">
                      {result.report.countersigns.counted} counted · {result.report.countersigns.peer} peer · {result.report.countersigns.rejected} rejected ·{" "}
                      {result.report.claims.total} claim{result.report.claims.total === 1 ? "" : "s"} · {result.report.incidents.length} incident
                      {result.report.incidents.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="row" style={{ marginTop: 18 }}>
              <button type="button" className="ghost small" disabled={busy} onClick={() => void run(scenario.id)}>
                ↻ Run again
              </button>
              {(() => {
                const i = SCENARIOS.findIndex((s) => s.id === scenario.id);
                const next = SCENARIOS[(i + 1) % SCENARIOS.length]!;
                return (
                  <button type="button" className="small" onClick={() => void run(next.id)}>
                    Next: {next.title} →
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
