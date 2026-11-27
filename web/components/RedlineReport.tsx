"use client";

import type { RedlineReport as Report } from "@countersign/redline";
import { CopyButton } from "./CopyButton";
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

export function verdictOf(report: Report): { kind: "ok" | "bad" | "warn"; stamp: string; sub: string } {
  const failed = report.results.filter((r) => !r.passed);
  const warned = report.results.filter((r) => r.passed && r.findings.length > 0);
  if (failed.length) return { kind: "bad", stamp: "Blocked", sub: `Fails ${failed.map((r) => r.rule).join(", ")}. The companion would refuse to install it.` };
  if (warned.length) return { kind: "warn", stamp: "Passed", sub: `With an advisory: ${warned.map((r) => r.rule).join(", ")}.` };
  return { kind: "ok", stamp: "Passed", sub: `All ${report.results.length} rules, no findings.` };
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
