"use client";

import { useState } from "react";

interface Finding {
  rule: string;
  severity: "fail" | "warn";
  file: string;
  line: number;
  snippet: string;
  message: string;
}
interface Result {
  rule: string;
  title: string;
  passed: boolean;
  findings: Finding[];
}
interface CheckResponse {
  error?: string;
  contentHash?: string;
  fileCount?: number;
  manifest?: { manifestHash: string; publisher: string; targets: number; flows: number } | null;
  manifestProblem?: string | null;
  reportHash?: string;
  report?: { results: Result[]; notes: string[] };
}

export function CheckForm() {
  const [uri, setUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CheckResponse | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/v1/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uri }) });
      setRes((await r.json()) as CheckResponse);
    } catch (err) {
      setRes({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="check" onSubmit={run}>
        <input
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="https://github.com/<owner>/<repo>/tree/<commit>/<skill-folder>"
          spellCheck={false}
          required
        />
        <button disabled={busy}>{busy ? "Checking…" : "Run check"}</button>
      </form>
      {res?.error ? <p className="notice">{res.error}</p> : null}
      {res?.report ? (
        <>
          <h2>Result</h2>
          <table>
            <tbody>
              {res.report.results.map((r) => (
                <tr key={r.rule}>
                  <td style={{ width: 80 }}>
                    <span className={`pill ${r.passed ? (r.findings.length ? "warning" : "ok") : "incident"}`}>{r.passed ? (r.findings.length ? "warn" : "pass") : "fail"}</span>
                  </td>
                  <td>
                    <strong>{r.rule}</strong> {r.title}
                    {r.findings.length ? (
                      <ul className="reasons small">
                        {r.findings.map((f, i) => (
                          <li key={i}>
                            {f.message}{" "}
                            <span className="muted">
                              ({f.file}:{f.line})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            {res.fileCount} files · content hash <span className="hash">{res.contentHash}</span>
            <br />
            {res.manifest ? (
              <>
                manifest {res.manifest.targets} targets, {res.manifest.flows} flows · publisher <span className="hash">{res.manifest.publisher}</span>
              </>
            ) : (
              <>manifest: {res.manifestProblem}</>
            )}
            <br />
            report hash <span className="hash">{res.reportHash}</span>
          </p>
        </>
      ) : null}
    </>
  );
}
