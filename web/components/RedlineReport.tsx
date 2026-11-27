"use client";

import type { RedlineReport as Report } from "@countersign/redline";
import { CopyButton } from "./CopyButton";

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

export function verdictOf(report: Report): { cls: "ok" | "bad" | "warn"; title: string; sub: string } {
  const failed = report.results.filter((r) => !r.passed);
  const warned = report.results.filter((r) => r.passed && r.findings.length > 0);
  if (failed.length)
    return {
      cls: "bad",
      title: `Blocked: fails ${failed.length} red-line rule${failed.length === 1 ? "" : "s"}`,
      sub: `${failed.map((r) => r.rule).join(", ")}. An agent running the COUNTERSIGN companion would refuse to install this.`,
    };
  if (warned.length)
    return { cls: "warn", title: "Passes, with an advisory", sub: `${warned.map((r) => `${r.rule}: ${r.title.toLowerCase()}`).join("; ")}.` };
  return { cls: "ok", title: `Passes all ${report.results.length} checked rules`, sub: "No findings. This report hash is what an attestation would anchor on-chain." };
}

export function RedlineReportView({ view }: { view: CheckView }) {
  const { report } = view;
  const v = verdictOf(report);
  return (
    <div className="rl-report rise">
      <div className={`verdict shown ${v.cls}`}>
        <div className="verdict-line">
          <span className="vi">{v.cls === "ok" ? "✓" : v.cls === "warn" ? "!" : "✗"}</span>
          {v.title}
        </div>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          {v.sub}
        </p>
      </div>

      <div className="rl-rules">
        {report.results.map((r) => {
          const state = !r.passed ? "fail" : r.findings.length ? "warn" : "pass";
          return (
            <div key={r.rule} className={`rl-rule step-${state}`}>
              <span className="ti">{state === "pass" ? "✓" : state === "warn" ? "!" : "✗"}</span>
              <div>
                <div className="tt">
                  <span className="mono faint">{r.rule}</span> {r.title}
                </div>
                {r.findings.length ? (
                  <ul className="rl-findings">
                    {r.findings.map((f, i) => (
                      <li key={i}>
                        <span>{f.message}</span> <span className="mono faint">{f.file}:{f.line}</span>
                        {!view.redact && f.snippet ? <code className="snippet">{f.snippet}</code> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="td">{state === "pass" ? "no findings" : ""}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {view.redact ? <p className="tiny faint">Snippets are hidden for the sample, so its harmful wording never appears on this site.</p> : null}

      <div className="rl-meta card flat">
        <div>
          <div className="k">Checked</div>
          <div>
            {view.label} · {report.input.fileCount} file{report.input.fileCount === 1 ? "" : "s"}{" "}
            {view.source === "github" ? "(fetched read-only from GitHub)" : "(computed in your browser; nothing was uploaded)"}
          </div>
        </div>
        <div>
          <div className="k">Content hash</div>
          <div className="hash">{report.input.contentHash}</div>
        </div>
        <div>
          <div className="k">countersign.json</div>
          <div>
            {view.manifest ? (
              <>
                {view.manifest.targets} target{view.manifest.targets === 1 ? "" : "s"}, {view.manifest.flows} flow{view.manifest.flows === 1 ? "" : "s"}
                {view.manifest.anchors !== undefined ? `, ${view.manifest.anchors} anchor${view.manifest.anchors === 1 ? "" : "s"}` : ""} · publisher{" "}
                <span className="hash">{view.manifest.publisher}</span>
              </>
            ) : (
              <span className="muted">{view.manifestProblem ?? "none"}</span>
            )}
          </div>
        </div>
        <div>
          <div className="k">Report hash</div>
          <div className="row tight">
            <span className="hash">{view.reportHash}</span>
            <CopyButton text={view.reportHash} />
          </div>
        </div>
      </div>
      <p className="tiny faint">
        Reproduce locally: <code>node skills/countersign/scripts/countersign.mjs redline &lt;skill-dir&gt; --json</code> gives the same
        findings and the same report hash ({report.ruleset}).
      </p>
    </div>
  );
}
