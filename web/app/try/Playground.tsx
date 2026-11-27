"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OUTCOME_STAMP, Stamp } from "@/components/Stamp";
import { badgeSvg } from "@/lib/badge";
import { REASON_TEXT, SCENARIOS, type Scenario, type ScenarioResult, type TraceStep } from "@/lib/sim/scenarios";
import { ACTORS, ago, FN_NAMES, labelOf } from "@/lib/sim/world";
import { scoreLine } from "@/lib/score";
import { SITE_URL } from "@/lib/site";

const GROUPS: { key: Scenario["group"]; title: string }[] = [
  { key: "fake", title: "Fake it" },
  { key: "real", title: "Use it for real" },
  { key: "author", title: "Catch the author" },
];

const STEP_ICON: Record<TraceStep["state"], string> = { pass: "✓", fail: "✗", warn: "!", skip: "–", info: "i" };

export const badgeUri = (r: ScenarioResult["report"]) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(badgeSvg({ counted: r.countersigns.counted, incidents: r.incidents.length, status: r.status }))}`;

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
            {s.state === "pass"
              ? null
              : s.detail.map((d, j) => (
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
  if (rows.length === 0) return <p className="td">No transactions cited.</p>;
  return (
    <div className="table-wrap">
      <table className="txs">
        <thead>
          <tr>
            <th>When</th>
            <th>From</th>
            <th>Called</th>
            <th>Effect</th>
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
  const caseRef = useRef<HTMLDivElement>(null);
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
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setRevealed(total);
    else {
      let n = 0;
      timer.current = setInterval(() => {
        n += 1;
        setRevealed(n);
        if (n >= total && timer.current) clearInterval(timer.current);
      }, 120);
    }
    if (scroll && caseRef.current) {
      const top = caseRef.current.getBoundingClientRect().top;
      if (window.innerWidth < 980 || top < 0) caseRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(scoreLine(tried, fakes.length))}&url=${encodeURIComponent(`${SITE_URL}/r/${tried}`)}`;
  const verdictShown = Boolean(result) && revealed > (result?.steps.length ?? 0);
  const stamp = result ? OUTCOME_STAMP[result.outcome] : null;
  const index = SCENARIOS.findIndex((s) => s.id === scenario.id);
  const next = SCENARIOS[(index + 1) % SCENARIOS.length]!;
  const actor = ACTORS[scenario.actor];

  return (
    <div className="wrap">
      <div className="paper punch">
        <div className="punch-head">
          <span>Fakes tried</span>
          <span>
            {tried}/{fakes.length}
          </span>
        </div>
        <div className="punch-body">
          <div className="punch-slots">
            {fakes.map((s) => {
              const r = results[s.id];
              const st = r ? OUTCOME_STAMP[r.outcome] : null;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`slot${s.id === selected ? " on" : ""}${st ? ` done ${st.kind}` : ""}`}
                  onClick={() => void run(s.id, true)}
                  aria-label={`${s.title}${st ? `: ${st.label}` : ""}`}
                  title={s.title}
                >
                  <span className="slot-n" aria-hidden="true" />
                  {st ? (
                    <Stamp kind={st.kind} className="slam">
                      {st.label}
                    </Stamp>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="punch-side">
            <div className="punch-count">
              <b className={fakeCounted ? "bad" : "ok"}>{fakeCounted}</b> counted
            </div>
            {result ? <img src={badgeUri(result.report)} alt="dca-planner's badge" height={20} /> : null}
            {tried >= 3 ? (
              <a className="textlink" href={shareUrl} target="_blank" rel="noreferrer">
                Share ↗
              </a>
            ) : null}
          </div>
        </div>
        {tried === fakes.length ? (
          <Stamp kind={fakeCounted ? "bad" : "ok"} big className="punch-done slam">
            {tried} tried · {fakeCounted} counted
          </Stamp>
        ) : null}
      </div>

      <div className="play">
        <aside className="rail" aria-label="Scenarios">
          {GROUPS.map((g) => (
            <div key={g.key}>
              <div className="rail-group">{g.title}</div>
              {SCENARIOS.filter((s) => s.group === g.key).map((s) => {
                const r = results[s.id];
                const n = SCENARIOS.indexOf(s) + 1;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`rail-row ${s.id === selected ? "active" : ""}`}
                    aria-pressed={s.id === selected}
                    onClick={() => void run(s.id, true)}
                  >
                    <span className="n">{String(n).padStart(2, "0")}</span>
                    <span className="t">{s.title}</span>
                    {r ? <Stamp kind={OUTCOME_STAMP[r.outcome].kind}>{OUTCOME_STAMP[r.outcome].label}</Stamp> : <span className="pending">—</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <div className="case" ref={caseRef}>
          <div className="case-file">
            <div className="case-no">
              Case {String(index + 1).padStart(2, "0")} · {GROUPS.find((g) => g.key === scenario.group)?.title}
            </div>
            <h2>{scenario.title}</h2>
            <div className="case-who">
              <b>{actor.name}</b> · {actor.role}
            </div>
            <p className="case-attempt">{scenario.attempt}</p>

            <div className={`verdict ${verdictShown ? "shown" : ""}`} aria-live="polite">
              {result && stamp ? (
                <>
                  <Stamp kind={stamp.kind} big>
                    {result.revert ? `${stamp.label} · ${result.revert.error}` : stamp.label}
                  </Stamp>
                  <p className="lesson">{scenario.lesson}</p>
                </>
              ) : null}
            </div>

            <div className="sub">The real verifier</div>
            {result ? <Trace steps={result.steps} revealed={revealed} /> : <p className="td">Running…</p>}

            <div className="sub">On the simulated chain</div>
            {result ? <TxTable rows={result.txs} /> : null}

            {result ? (
              <div className="case-meta">
                <img src={badgeUri(result.report)} alt="" height={20} />
                {result.report.countersigns.counted} counted · {result.report.claims.total} claims · {result.report.incidents.length} incidents
              </div>
            ) : null}
            <div className="case-actions">
              <button type="button" className="btn line sm" disabled={busy} onClick={() => void run(scenario.id)}>
                Run again
              </button>
              <button type="button" className="btn sm" onClick={() => void run(next.id)}>
                Next: {next.title} →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
