"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BUILDER, runBuilder, type BuilderOptions, type ScenarioResult } from "@/lib/sim/scenarios";
import { badgeUri, Trace, TxTable, VERDICT } from "./Playground";

type Choice<K extends keyof BuilderOptions> = { value: BuilderOptions[K]; label: string };

const CONTROLS: { [K in keyof BuilderOptions]: { label: string; choices: Choice<K>[] } } = {
  signer: {
    label: "Who countersigns",
    choices: [
      { value: "you", label: "You (Agent ID #2)" },
      { value: "friend", label: "A friend (#3)" },
      { value: "author", label: "The author (#1)" },
      { value: "bot", label: "A bot (no Agent ID)" },
    ],
  },
  sender: {
    label: "The cited transaction was sent by",
    choices: [
      { value: "signer", label: "the countersigner" },
      { value: "someone", label: "someone else" },
    ],
  },
  target: {
    label: "It called",
    choices: [
      { value: "vault", label: "the author's vault" },
      { value: "token", label: "the shared stablecoin" },
      { value: "other", label: "an unrelated contract" },
    ],
  },
  fn: {
    label: "Function",
    choices: [
      { value: "declared", label: "declared in countersign.json" },
      { value: "undeclared", label: "not declared" },
    ],
  },
  when: {
    label: "When",
    choices: [
      { value: "recent", label: "18 min ago" },
      { value: "old", label: "3 days ago" },
      { value: "before", label: "before the skill existed" },
    ],
  },
  approval: {
    label: "Approval it made",
    choices: [
      { value: "none", label: "none" },
      { value: "capped", label: "50 USD to the vault (cap 100)" },
      { value: "over-cap", label: "unlimited to the vault" },
      { value: "undeclared", label: "50 USD to an unknown address" },
    ],
  },
  status: {
    label: "Result",
    choices: [
      { value: "success", label: "succeeded" },
      { value: "reverted", label: "reverted" },
    ],
  },
};

export function Builder() {
  const [opts, setOpts] = useState<BuilderOptions>(DEFAULT_BUILDER);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  useEffect(() => {
    let alive = true;
    void runBuilder(opts).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [opts]);

  const v = result ? VERDICT[result.outcome] : null;
  return (
    <div className="builder">
      <div className="card builder-controls">
        {(Object.keys(CONTROLS) as (keyof BuilderOptions)[]).map((key) => {
          const c = CONTROLS[key] as { label: string; choices: { value: string; label: string }[] };
          return (
            <fieldset key={key} className="seg-field">
              <legend>{c.label}</legend>
              <div className="seg">
                {c.choices.map((ch) => (
                  <button
                    key={ch.value}
                    type="button"
                    aria-pressed={opts[key] === ch.value}
                    onClick={() => setOpts((o) => ({ ...o, [key]: ch.value }))}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
        <button type="button" className="link small" onClick={() => setOpts(DEFAULT_BUILDER)}>
          reset to an honest session
        </button>
      </div>
      <div className="card builder-out">
        {result && v ? (
          <>
            <div className={`verdict shown ${v.cls}`}>
              <div className="verdict-line">
                <span className="vi">{v.icon}</span>
                {result.revert ? `Reverted: ${result.revert.error}()` : v.label}
              </div>
              <div className="row tight" style={{ marginTop: 8 }}>
                <img src={badgeUri(result.report)} alt="badge" height={20} />
              </div>
            </div>
            <h4 className="sub">The cited transaction</h4>
            <TxTable rows={result.txs} />
            <h4 className="sub">Checks</h4>
            <Trace steps={result.steps} />
          </>
        ) : (
          <p className="muted">Running the verifier…</p>
        )}
      </div>
    </div>
  );
}
