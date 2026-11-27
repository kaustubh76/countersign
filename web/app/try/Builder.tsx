"use client";

import { useEffect, useState } from "react";
import { OUTCOME_STAMP, Stamp } from "@/components/Stamp";
import { DEFAULT_BUILDER, runBuilder, type BuilderOptions, type ScenarioResult } from "@/lib/sim/scenarios";
import { badgeUri, Trace } from "./Playground";

type Choice = { value: string; label: string };

const CONTROLS: { key: keyof BuilderOptions; label: string; choices: Choice[] }[] = [
  {
    key: "signer",
    label: "Who countersigns",
    choices: [
      { value: "you", label: "You" },
      { value: "friend", label: "A friend" },
      { value: "author", label: "The author" },
      { value: "bot", label: "A bot" },
    ],
  },
  {
    key: "sender",
    label: "Tx sent by",
    choices: [
      { value: "signer", label: "the countersigner" },
      { value: "someone", label: "someone else" },
    ],
  },
  {
    key: "target",
    label: "Tx called",
    choices: [
      { value: "vault", label: "the author's vault" },
      { value: "token", label: "a shared token" },
      { value: "other", label: "something else" },
    ],
  },
  {
    key: "fn",
    label: "Function",
    choices: [
      { value: "declared", label: "declared" },
      { value: "undeclared", label: "undeclared" },
    ],
  },
  {
    key: "when",
    label: "When",
    choices: [
      { value: "recent", label: "18 min ago" },
      { value: "old", label: "3 days ago" },
      { value: "before", label: "before the skill" },
    ],
  },
  {
    key: "approval",
    label: "Approval",
    choices: [
      { value: "none", label: "none" },
      { value: "capped", label: "50 (cap 100)" },
      { value: "over-cap", label: "unlimited" },
      { value: "undeclared", label: "to a stranger" },
    ],
  },
  {
    key: "status",
    label: "Result",
    choices: [
      { value: "success", label: "succeeded" },
      { value: "reverted", label: "reverted" },
    ],
  },
];

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

  const stamp = result ? OUTCOME_STAMP[result.outcome] : null;
  return (
    <div className="builder">
      <div className="builder-controls">
        {CONTROLS.map((c) => (
          <fieldset key={c.key} className="seg-field">
            <legend>{c.label}</legend>
            <div className="seg">
              {c.choices.map((ch) => (
                <button key={ch.value} type="button" aria-pressed={opts[c.key] === ch.value} onClick={() => setOpts((o) => ({ ...o, [c.key]: ch.value }))}>
                  {ch.label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <button type="button" className="link" onClick={() => setOpts(DEFAULT_BUILDER)}>
          reset to an honest session
        </button>
      </div>
      <div className="builder-out">
        {result && stamp ? (
          <>
            <div className="verdict shown">
              <Stamp kind={stamp.kind} big>
                {result.revert ? `${stamp.label} · ${result.revert.error}` : stamp.label}
              </Stamp>
              <img src={badgeUri(result.report)} alt="badge" height={20} />
            </div>
            <div className="sub">Checks</div>
            <Trace steps={result.steps} />
          </>
        ) : (
          <p className="td">Running the verifier…</p>
        )}
      </div>
    </div>
  );
}
