"use client";

import { useMemo, useState } from "react";
import { BSC_CHAIN_ID, BUILTIN_ACTIONS, FLAG_ANCHOR, MANIFEST_SCHEMA, ManifestError, parseManifest, selectorOf, type ManifestJson } from "@countersign/core/browser";
import { CopyButton } from "@/components/CopyButton";
import { Stamp } from "@/components/Stamp";

interface TargetRow {
  address: string;
  label: string;
  anchor: boolean;
  pull: boolean;
  impl: string;
  maxValueWei: string;
  functions: string;
}
interface FlowRow {
  kind: "approve" | "transfer";
  token: string;
  counterparty: string;
  cap: string;
  label: string;
}
interface State {
  publisher: string;
  name: string;
  targets: TargetRow[];
  flows: FlowRow[];
  builtins: string[];
}

const emptyTarget = (anchor = false): TargetRow => ({ address: "", label: "", anchor, pull: false, impl: "", maxValueWei: "0", functions: "" });
const emptyFlow = (): FlowRow => ({ kind: "approve", token: "", counterparty: "", cap: "", label: "" });
const INITIAL: State = { publisher: "", name: "", targets: [emptyTarget(true)], flows: [], builtins: [] };

/** A fictional example to show the shape. Its made-up addresses are padded at runtime. */
const fake = (hex: string) => `0x${hex.padStart(40, "0")}`;
const EXAMPLE: State = {
  publisher: fake("a11ce"),
  name: "dca-planner",
  targets: [
    { address: fake("dca0a99"), label: "dca-planner vault", anchor: true, pull: false, impl: "", maxValueWei: "0", functions: "deposit(uint256)\nwithdraw(uint256)" },
    { address: fake("70ce"), label: "USD stablecoin", anchor: false, pull: false, impl: "", maxValueWei: "0", functions: "approve(address,uint256)" },
  ],
  flows: [{ kind: "approve", token: fake("70ce"), counterparty: fake("dca0a99"), cap: "100000000000000000000", label: "stablecoin to the vault" }],
  builtins: [],
};

function toJson(s: State): ManifestJson {
  return {
    schema: MANIFEST_SCHEMA,
    chainId: BSC_CHAIN_ID,
    publisher: s.publisher.trim(),
    ...(s.name.trim() ? { name: s.name.trim() } : {}),
    targets: s.targets.map((t) => ({
      address: t.address.trim(),
      ...(t.label.trim() ? { label: t.label.trim() } : {}),
      ...(t.impl.trim() ? { impl: t.impl.trim() } : {}),
      ...(t.maxValueWei.trim() && t.maxValueWei.trim() !== "0" ? { maxValueWei: t.maxValueWei.trim() } : {}),
      ...(t.anchor ? { anchor: true } : {}),
      ...(t.pull ? { pull: true } : {}),
      functions: t.functions
        .split(/\n|;/)
        .map((f) => f.trim())
        .filter(Boolean),
    })),
    flows: s.flows.map((f) => ({ kind: f.kind, token: f.token.trim(), counterparty: f.counterparty.trim(), cap: f.cap.trim(), ...(f.label.trim() ? { label: f.label.trim() } : {}) })),
    builtins: s.builtins,
  };
}

export function ManifestBuilder() {
  const [s, setS] = useState<State>(INITIAL);
  const json = useMemo(() => toJson(s), [s]);
  const text = useMemo(() => JSON.stringify(json, null, 2), [json]);
  const result = useMemo(() => {
    try {
      const m = parseManifest(json);
      const selectors = json.targets.flatMap((t) =>
        t.functions.map((f) => {
          try {
            return { fn: f, sel: selectorOf(f) };
          } catch {
            return { fn: f, sel: "?" };
          }
        }),
      );
      return { ok: true as const, hash: m.manifestHash, anchors: m.onchain.targets.filter((t) => (t.flags & FLAG_ANCHOR) !== 0).length, selectors };
    } catch (e) {
      return { ok: false as const, problems: e instanceof ManifestError ? e.problems : [(e as Error).message] };
    }
  }, [json]);

  const setT = (i: number, patch: Partial<TargetRow>) => setS((p) => ({ ...p, targets: p.targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const setF = (i: number, patch: Partial<FlowRow>) => setS((p) => ({ ...p, flows: p.flows.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));

  return (
    <div className="mb">
      <div className="mb-form">
        <div className="mb-head">
          <span>Your skill</span>
          <span className="pair-btns">
            <button type="button" className="btn line sm" onClick={() => setS(EXAMPLE)}>
              Example
            </button>
            <button type="button" className="btn line sm" onClick={() => setS(INITIAL)}>
              Clear
            </button>
          </span>
        </div>
        <div className="pair">
          <label className="field">
            Publisher (your Agent ID wallet)
            <input className="mono" value={s.publisher} placeholder="0x…" spellCheck={false} onChange={(e) => setS({ ...s, publisher: e.target.value })} />
          </label>
          <label className="field">
            Skill name
            <input value={s.name} placeholder="my-skill" onChange={(e) => setS({ ...s, name: e.target.value })} />
          </label>
        </div>

        <div className="mb-section">
          <div className="mb-head">
            <span>Contracts it calls</span>
            <button type="button" className="btn line sm" onClick={() => setS({ ...s, targets: [...s.targets, emptyTarget()] })} disabled={s.targets.length >= 16}>
              + contract
            </button>
          </div>
          {s.targets.map((t, i) => (
            <div key={i} className="mb-row">
              <div className="pair">
                <label className="field">
                  Address
                  <input className="mono" value={t.address} placeholder="0x…" spellCheck={false} onChange={(e) => setT(i, { address: e.target.value })} />
                </label>
                <label className="field">
                  Label
                  <input value={t.label} placeholder="what it is" onChange={(e) => setT(i, { label: e.target.value })} />
                </label>
              </div>
              <label className="field">
                Functions, one per line
                <textarea className="mono" rows={2} value={t.functions} placeholder={"deposit(uint256)\nwithdraw(uint256)"} spellCheck={false} onChange={(e) => setT(i, { functions: e.target.value })} />
              </label>
              <div className="mb-flags">
                <label className="check-label">
                  <input type="checkbox" checked={t.anchor} onChange={(e) => setT(i, { anchor: e.target.checked })} /> anchor (you own it)
                </label>
                <label className="check-label">
                  <input type="checkbox" checked={t.pull} onChange={(e) => setT(i, { pull: e.target.checked })} /> may pull approved tokens
                </label>
                <label className="field inline">
                  max wei
                  <input className="mono" value={t.maxValueWei} onChange={(e) => setT(i, { maxValueWei: e.target.value })} style={{ width: 120 }} />
                </label>
                <label className="field inline">
                  proxy impl
                  <input className="mono" value={t.impl} placeholder="none" onChange={(e) => setT(i, { impl: e.target.value })} style={{ width: 150 }} />
                </label>
                {s.targets.length > 1 ? (
                  <button type="button" className="link" onClick={() => setS({ ...s, targets: s.targets.filter((_, j) => j !== i) })}>
                    remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-section">
          <div className="mb-head">
            <span>Approvals and transfers, capped</span>
            <button type="button" className="btn line sm" onClick={() => setS({ ...s, flows: [...s.flows, emptyFlow()] })} disabled={s.flows.length >= 32}>
              + flow
            </button>
          </div>
          {s.flows.map((f, i) => (
            <div key={i} className="mb-row">
              <div className="pair">
                <label className="field">
                  Kind
                  <select value={f.kind} onChange={(e) => setF(i, { kind: e.target.value as FlowRow["kind"] })}>
                    <option value="approve">approve</option>
                    <option value="transfer">transfer</option>
                  </select>
                </label>
                <label className="field">
                  Token (or &quot;native&quot;)
                  <input className="mono" value={f.token} placeholder="0x…" spellCheck={false} onChange={(e) => setF(i, { token: e.target.value })} />
                </label>
                <label className="field">
                  {f.kind === "approve" ? "Spender" : "Recipient"}
                  <input className="mono" value={f.counterparty} placeholder="0x…" spellCheck={false} onChange={(e) => setF(i, { counterparty: e.target.value })} />
                </label>
                <label className="field">
                  Cap (base units, never unlimited)
                  <input className="mono" value={f.cap} placeholder="100000000000000000000" onChange={(e) => setF(i, { cap: e.target.value })} />
                </label>
              </div>
              <button type="button" className="link" onClick={() => setS({ ...s, flows: s.flows.filter((_, j) => j !== i) })}>
                remove
              </button>
            </div>
          ))}
        </div>

        <div className="mb-section">
          <div className="mb-head">
            <span>Built-in wallet actions</span>
          </div>
          <div className="mb-flags">
            {BUILTIN_ACTIONS.map((b) => (
              <label key={b} className="check-label">
                <input
                  type="checkbox"
                  checked={s.builtins.includes(b)}
                  onChange={(e) => setS({ ...s, builtins: e.target.checked ? [...s.builtins, b] : s.builtins.filter((x) => x !== b) })}
                />{" "}
                {b}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-out">
        <div className="paper">
          <div className="mb-status">
            {s === INITIAL ? (
              <Stamp kind="idle" big>
                Draft
              </Stamp>
            ) : (
              <Stamp kind={result.ok ? (result.anchors ? "ok" : "warn") : "bad"} big>
                {result.ok ? (result.anchors ? "Valid" : "No anchor") : "Invalid"}
              </Stamp>
            )}
          </div>
          {s === INITIAL ? (
            <p className="small">Fill in the form, or load the example.</p>
          ) : result.ok ? (
            <>
              <div className="sig-cap">manifestHash, as SkillRegistry stores it</div>
              <div className="hash">{result.hash}</div>
              {!result.anchors ? <p className="small">Mark a contract you own as the anchor, or no countersign can count.</p> : null}
            </>
          ) : (
            <ul>
              {result.problems.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="code" style={{ marginTop: 14 }}>
          <div className="code-head">
            <span>countersign.json</span>
            <span className="pair-btns">
              <CopyButton text={text} />
              <button
                type="button"
                className="copy"
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([`${text}\n`], { type: "application/json" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "countersign.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                download
              </button>
            </span>
          </div>
          <pre className="mb-json">{text}</pre>
        </div>
      </div>
    </div>
  );
}
