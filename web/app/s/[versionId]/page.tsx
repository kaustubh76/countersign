import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/CodeBlock";
import { Stamp } from "@/components/Stamp";
import { getIndex } from "@/lib/data";
import { INCIDENT_LABELS, REASON_LABELS, shortHash, STATUS_LABELS } from "@/lib/reasons";
import { bscscan, SITE_URL } from "@/lib/site";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ versionId: string }> }): Promise<Metadata> {
  const { versionId } = await params;
  return { title: `Version ${versionId.slice(0, 10)}…` };
}

export default async function VersionPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(versionId)) notFound();
  const index = await getIndex();
  const v = index.versions.find((x) => x.versionId.toLowerCase() === versionId.toLowerCase());
  if (!v) notFound();
  const r = v.report;
  const rejected = Object.entries(r.countersigns.rejectionReasons).sort((a, b) => b[1] - a[1]);
  const statusKind = v.status === "ok" ? "ok" : v.status === "incident" ? "bad" : v.status === "warning" ? "warn" : "idle";
  const checks: { state: string; title: string; detail: React.ReactNode }[] = [
    {
      state: r.canonical === "verified" ? "pass" : r.canonical === "mismatch" ? "fail" : "skip",
      title: `Published content: ${r.canonical}`,
      detail: (
        <>
          <a href={v.contentURI} rel="noreferrer">
            {v.contentURI.replace("https://github.com/", "")}
          </a>
          {r.canonicalDetail.length ? <div>{r.canonicalDetail.join("; ")}</div> : null}
        </>
      ),
    },
    { state: r.anchors.endorsed > 0 ? "pass" : "fail", title: `Anchors endorsed: ${r.anchors.endorsed} of ${r.anchors.declared}`, detail: "countersigns must hit one of these" },
    {
      state: r.attestation ? (r.attestation.revoked ? "warn" : r.attestation.rulesPassed === r.attestation.rulesChecked ? "pass" : "fail") : "skip",
      title: `Red-Line attestation: ${r.attestation ? (r.attestation.revoked ? "revoked" : r.attestation.rulesPassed === r.attestation.rulesChecked ? "passed" : "failed") : "none"}`,
      detail: r.attestation ? <span className="hash">{r.attestation.reportHash}</span> : "anyone can re-run the check",
    },
    {
      state: "info",
      title: `Records: ${r.countersigns.total} submitted · ${r.countersigns.counted} counted · ${r.countersigns.peer} peer · ${r.countersigns.rejected} rejected`,
      detail: rejected.length ? rejected.map(([code, n]) => `${n}× ${REASON_LABELS[code] ?? code}`).join(" · ") : "all shown, counted or not",
    },
  ];

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>{v.name}</h1>
          <p className="mono-line">{v.versionId}</p>
        </div>
      </section>
      <div className="wrap page-body">
        <div className="paper version-cert">
          <div className="cert-head">
            <span>Skill certificate</span>
            <span>BNB Smart Chain · block {v.registeredBlock}</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <Stamp kind={statusKind} big>
              {STATUS_LABELS[v.status] ?? v.status}
            </Stamp>
          </div>
          <div className="stats">
            <div>
              <b>{r.countersigns.counted}</b>
              <span>verified countersigns</span>
            </div>
            <div>
              <b>{r.incidents.length}</b>
              <span>verified incidents</span>
            </div>
            <div>
              <b>{r.claims.total}</b>
              <span>claims{r.claims.corroborated ? " (corroborated)" : ""}</span>
            </div>
          </div>
          {r.incidents.length ? (
            <ul className="plain" style={{ marginTop: 14, color: "var(--bad-paper)" }}>
              {r.incidents.map((i, n) => (
                <li key={n}>
                  {INCIDENT_LABELS[i.kind] ?? i.kind}: {i.detail}
                  {i.txHash ? (
                    <>
                      {" "}
                      (<a href={bscscan("tx", i.txHash)}>{shortHash(i.txHash)}</a>)
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <ol className="trace" style={{ marginTop: 10 }}>
            {checks.map((c) => (
              <li key={c.title} className={`shown step-${c.state}`}>
                <span className="ti">{c.state === "pass" ? "✓" : c.state === "fail" ? "✗" : c.state === "warn" ? "!" : c.state === "info" ? "i" : "–"}</span>
                <div>
                  <div className="tt">{c.title}</div>
                  <div className="td">{c.detail}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="sig-cap" style={{ marginTop: 14 }}>
            recomputed at block {r.computedAtBlock ?? "?"} · {r.ruleset} · <Link href="/docs#ruleset">rules</Link>
          </p>
        </div>

        <div className="two-col" style={{ marginTop: 40 }}>
          <div className="stack">
            <img src={`/api/v1/badge/${v.versionId}.svg`} alt="countersign badge" height={20} style={{ alignSelf: "flex-start" }} />
            <CodeBlock label="badge markdown" code={`[![countersign](${SITE_URL}/api/v1/badge/${v.versionId}.svg)](${SITE_URL}/s/${v.versionId})`} />
          </div>
          <CodeBlock label="verify it yourself" code={`countersign status ${v.versionId} --verify-local --json`} />
        </div>
      </div>
    </>
  );
}
