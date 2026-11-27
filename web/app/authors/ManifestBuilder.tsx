"use client";

import { useMemo, useState } from "react";
import { BSC_CHAIN_ID, BUILTIN_ACTIONS, FLAG_ANCHOR, MANIFEST_SCHEMA, ManifestError, parseManifest, selectorOf, type ManifestJson } from "@countersign/core/browser";
import { CopyButton } from "@/components/CopyButton";

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
      <div className="mb-form card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>countersign.json</h3>
          <div className="row tight">
            <button type="button" className="ghost small" onClick={() => setS(EXAMPLE)}>
              Load an example
            </button>
            <button type="button" className="ghost small" onClick={() => setS(INITIAL)}>
              Clear
            </button>
          </div>
        </div>
        <div className="grid two" style={{ gap: 12 }}>
          <label className="field">
            Publisher: your Agent ID wallet
            <input className="mono" value={s.publisher} placeholder="0x…" spellCheck={false} onChange={(e) => setS({ ...s, publisher: e.target.value })} />
          </label>
          <label className="field">
            Skill name (optional)
            <input value={s.name} placeholder="my-skill" onChange={(e) => setS({ ...s, name: e.target.value })} />
          </label>
        </div>

        <div className="mb-section">
          <div className="mb-head">
            <span>Contracts the skill calls</span>
            <button type="button" className="ghost small" onClick={() => setS({ ...s, targets: [...s.targets, emptyTarget()] })} disabled={s.targets.length >= 16}>
              + contract
            </button>
          </div>
          {s.targets.map((t, i) => (
            <div key={i} className="mb-row">
              <div className="grid two" style={{ gap: 10 }}>
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
                Functions the skill may call, one per line
                <textarea className="mono" rows={2} value={t.functions} placeholder={"deposit(uint256)\nwithdraw(uint256)"} spellCheck={false} onChange={(e) => setT(i, { functions: e.target.value })} />
              </label>
              <div className="row tight mb-flags">
                <label className="check-label">
                  <input type="checkbox" checked={t.anchor} onChange={(e) => setT(i, { anchor: e.target.checked })} /> anchor (a contract you own)
                </label>
                <label className="check-label">
                  <input type="checkbox" checked={t.pull} onChange={(e) => setT(i, { pull: e.target.checked })} /> may pull approved tokens
                </label>
                <label className="field inline">
                  max BNB per call (wei)
                  <input className="mono" value={t.maxValueWei} onChange={(e) => setT(i, { maxValueWei: e.target.value })} style={{ width: 150 }} />
                </label>
                <label className="field inline">
                  proxy implementation
                  <input className="mono" value={t.impl} placeholder="none" onChange={(e) => setT(i, { impl: e.target.value })} style={{ width: 170 }} />
                </label>
                {s.targets.length > 1 ? (
                  <button type="button" className="link tiny" onClick={() => setS({ ...s, targets: s.targets.filter((_, j) => j !== i) })}>
                    remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-section">
          <div className="mb-head">
            <span>Approvals and transfers (each with a cap)</span>
            <button type="button" className="ghost small" onClick={() => setS({ ...s, flows: [...s.flows, emptyFlow()] })} disabled={s.flows.length >= 32}>
              + flow
            </button>
          </div>
          {s.flows.length === 0 ? <p className="tiny faint">None. Add one for every token approval or direct transfer the skill makes.</p> : null}
          {s.flows.map((f, i) => (
            <div key={i} className="mb-row">
              <div className="grid two" style={{ gap: 10 }}>
                <label className="field">
                  Kind
                  <select value={f.kind} onChange={(e) => setF(i, { kind: e.target.value as FlowRow["kind"] })}>
                    <option value="approve">approve (spender)</option>
                    <option value="transfer">transfer (recipient)</option>
                  </select>
                </label>
                <label className="field">
                  Token address (or &quot;native&quot; for BNB transfers)
                  <input className="mono" value={f.token} placeholder="0x…" spellCheck={false} onChange={(e) => setF(i, { token: e.target.value })} />
                </label>
                <label className="field">
                  {f.kind === "approve" ? "Spender" : "Recipient"}
                  <input className="mono" value={f.counterparty} placeholder="0x…" spellCheck={false} onChange={(e) => setF(i, { counterparty: e.target.value })} />
                </label>
                <label className="field">
                  Cap, in the token&apos;s base units (never unlimited)
                  <input className="mono" value={f.cap} placeholder="100000000000000000000" onChange={(e) => setF(i, { cap: e.target.value })} />
                </label>
              </div>
              <button type="button" className="link tiny" onClick={() => setS({ ...s, flows: s.flows.filter((_, j) => j !== i) })}>
                remove
              </button>
            </div>
          ))}
        </div>

        <div className="mb-section">
          <div className="mb-head">
            <span>Built-in wallet actions used (informational)</span>
          </div>
          <div className="row tight">
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
        <div className={`verdict shown ${result.ok ? (result.anchors ? "ok" : "warn") : "bad"}`}>
          <div className="verdict-line" style={{ fontSize: "1.3rem" }}>
            <span className="vi">{result.ok ? (result.anchors ? "✓" : "!") : "✗"}</span>
            {result.ok ? (result.anchors ? "Valid manifest" : "Valid, but no anchor yet") : "Not valid yet"}
          </div>
          {result.ok ? (
            <div className="small" style={{ marginTop: 8 }}>
              <div className="muted">manifestHash (what SkillRegistry will store)</div>
              <div className="hash">{result.hash}</div>
              {!result.anchors ? (
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Mark a contract you own as the anchor. Countersigns must cite a transaction to it, or none will count.
                </p>
              ) : (
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  An anchor whose <code>owner()</code> is your publisher wallet is endorsed automatically when you register.
                </p>
              )}
            </div>
          ) : (
            <ul className="reasons small">
              {result.problems.slice(0, 8).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="code" style={{ marginTop: 14 }}>
          <div className="code-head">
            <span>countersign.json</span>
            <div className="row tight">
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
            </div>
          </div>
          <pre className="bare mb-json">{text}</pre>
        </div>
        {result.ok && result.selectors.length ? (
          <p className="tiny faint" style={{ marginTop: 10 }}>
            Selectors: {result.selectors.map((x) => `${x.fn} → ${x.sel}`).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
