"use client";

import type { RedlineReport as Report } from "@countersign/redline";
import { CopyButton } from "./CopyButton";
import { verdictOf } from "@/lib/verdict";
import { Stamp } from "./Stamp";

export interface ManifestSummary {
  manifestHash: string;
  publisher: string;
  targets: number;
  flows: number;
  anchors?: number;
}

export interface CheckView {
  source: "github" | "local" | "sample";
  label: string;
  report: Report;
  reportHash: string;
  manifest: ManifestSummary | null;
  manifestProblem: string | null;
  /** Hide finding snippets (used for the deliberately malicious sample). */
  redact?: boolean;
}

export function RedlineReportView({ view }: { view: CheckView }) {
  const { report } = view;
  const v = verdictOf(report);
  return (
    <div className="rl-report rise">
      <div className="rl-verdict">
        <Stamp kind={v.kind} big>
          {v.stamp}
        </Stamp>
        <p>{v.sub}</p>
      </div>

      <div>
        {report.results.map((r) => {
          const state = !r.passed ? "fail" : r.findings.length ? "warn" : "pass";
          return (
            <div key={r.rule} className={`rl-row step-${state}`}>
              <span className="ti">{state === "pass" ? "✓" : state === "warn" ? "!" : "✗"}</span>
              <span className="id">{r.rule}</span>
              <div>
                <div className="tt">{r.title}</div>
                {r.findings.length ? (
                  <ul className="rl-findings">
                    {r.findings.map((f, i) => (
                      <li key={i}>
                        {f.message} <span className="hash">{f.file}:{f.line}</span>
                        {!view.redact && f.snippet ? <code className="snippet">{f.snippet}</code> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {view.redact ? <p className="tiny faint">Snippets hidden for the sample, so its wording never appears on this site.</p> : null}

      {report.input.contracts?.length ? (
        <div className="ledger rl-contracts">
          {report.input.contracts.map((c) => (
            <div key={c.address} className="ledger-row">
              <span className="k">{c.contractName ?? "contract"}</span>
              <span className="why">
                {c.address.slice(0, 6)}…{c.address.slice(-4)} · {c.role} · {c.status === "verified" ? c.provider : c.status}
              </span>
              <span className="leader" />
              <span className="powers">
                {c.powers.filter((p) => !p.dead).length
                  ? c.powers
                      .filter((p) => !p.dead)
                      .map((p) => `${p.category}${c.role === "project" ? (p.disclosed ? " ✓" : " ✗") : ""}`)
                      .filter((x, i, all) => all.indexOf(x) === i)
                      .join(" · ")
                  : c.status === "verified"
                    ? "no admin powers"
                    : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {!report.results.some((r) => r.rule === "RL4") ? (
        <p className="tiny faint">
          RL4, owner powers:{" "}
          {report.notes.find((n) => n.startsWith("RL4"))?.replace(/^RL4 not checked: /, "not checked: ") ??
            (view.source === "github" ? "not checked" : "runs on the GitHub tab, where your contracts' verified source is read")}
        </p>
      ) : null}

      <div className="rl-meta">
        <div>
          <div className="k">Checked</div>
          <div>
            {view.label} · {report.input.fileCount} files · {view.source === "github" ? "read-only from GitHub" : "in this tab, never uploaded"}
          </div>
        </div>
        <div>
          <div className="k">Content hash</div>
          <div className="hash">{report.input.contentHash}</div>
        </div>
        <div>
          <div className="k">countersign.json</div>
          <div className="small">
            {view.manifest ? (
              <>
                {view.manifest.targets} contracts · {view.manifest.flows} flows
                {view.manifest.anchors !== undefined ? ` · ${view.manifest.anchors} anchor` : ""}
              </>
            ) : (
              <span className="dim">{view.manifestProblem ?? "none"}</span>
            )}
          </div>
        </div>
        <div>
          <div className="k">Report hash</div>
          <div className="hash">{view.reportHash}</div>
          <CopyButton text={view.reportHash} />
        </div>
      </div>
      <p className="tiny faint">
        Same result locally: <code>countersign redline &lt;skill-dir&gt; --json</code> ({report.ruleset})
      </p>
    </div>
  );
}
