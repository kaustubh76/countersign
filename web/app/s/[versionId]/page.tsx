import { notFound } from "next/navigation";
import { getIndex } from "@/lib/data";
import { INCIDENT_LABELS, REASON_LABELS, shortHash, STATUS_LABELS } from "@/lib/reasons";

export const revalidate = 60;

export default async function VersionPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(versionId)) notFound();
  const index = await getIndex();
  const v = index.versions.find((x) => x.versionId.toLowerCase() === versionId.toLowerCase());
  if (!v) notFound();
  const r = v.report;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const rejected = Object.entries(r.countersigns.rejectionReasons).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <p className="small muted">Skill version</p>
      <h1>{v.name}</h1>
      <div className="row">
        <span className={`pill ${v.status}`}>{STATUS_LABELS[v.status] ?? v.status}</span>
        <span className="hash muted">{v.versionId}</span>
      </div>

      <div className="grid three" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="big">{r.countersigns.counted}</div>
          <div className="muted">Agent ID holders whose own sessions were verified</div>
        </div>
        <div className="card">
          <div className="big" style={{ color: r.incidents.length ? "var(--bad)" : undefined }}>{r.incidents.length}</div>
          <div className="muted">verified incidents</div>
        </div>
        <div className="card">
          <div className="big">{r.claims.total}</div>
          <div className="muted">unverified reports{r.claims.corroborated ? " (corroborated by 3+ independent users)" : ""}</div>
        </div>
      </div>

      {r.incidents.length > 0 ? (
        <>
          <h2>Verified incidents</h2>
          <ul className="reasons">
            {r.incidents.map((i, n) => (
              <li key={n}>
                <strong>{INCIDENT_LABELS[i.kind] ?? i.kind}:</strong> {i.detail}
                {i.txHash ? (
                  <>
                    {" "}
                    (<a href={`https://bscscan.com/tx/${i.txHash}`}>{shortHash(i.txHash)}</a>)
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>What was checked</h2>
      <table>
        <tbody>
          <tr>
            <td>Countersign records</td>
            <td>
              {r.countersigns.total} submitted · <strong>{r.countersigns.counted} counted</strong> · {r.countersigns.peer} reciprocal-pair (not counted) ·{" "}
              {r.countersigns.rejected} rejected
              {rejected.length ? (
                <ul className="reasons small muted">
                  {rejected.map(([code, n]) => (
                    <li key={code}>
                      {n}× {REASON_LABELS[code] ?? code}
                    </li>
                  ))}
                </ul>
              ) : null}
            </td>
          </tr>
          <tr>
            <td>Anchors</td>
            <td>
              {r.anchors.endorsed} of {r.anchors.declared} author-owned contracts endorsed{" "}
              {r.anchors.endorsed === 0 ? <span className="pill warning">no countersign can count yet</span> : null}
            </td>
          </tr>
          <tr>
            <td>Published content</td>
            <td>
              <span className={`pill ${r.canonical === "verified" ? "ok" : r.canonical === "mismatch" ? "incident" : "none"}`}>{r.canonical}</span>{" "}
              <a href={v.contentURI}>{v.contentURI}</a>
              {r.canonicalDetail.length ? <div className="small muted">{r.canonicalDetail.join("; ")}</div> : null}
            </td>
          </tr>
          <tr>
            <td>Red-Line attestation</td>
            <td>
              {r.attestation ? (
                <>
                  {r.attestation.revoked ? "revoked" : r.attestation.rulesPassed === r.attestation.rulesChecked ? "all checked rules passed" : "some rules failed"}
                  <div className="hash muted small">report {r.attestation.reportHash}</div>
                </>
              ) : (
                "none"
              )}
            </td>
          </tr>
          <tr>
            <td>Registered</td>
            <td>
              block {v.registeredBlock} ({v.registeredAt.slice(0, 10)})
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Badge</h2>
      <p>
        <img src={`/api/v1/badge/${v.versionId}.svg`} alt="countersign badge" />
      </p>
      <pre>{`[![countersign](${site}/api/v1/badge/${v.versionId}.svg)](${site}/s/${v.versionId})`}</pre>

      <h2>Verify it yourself</h2>
      <pre>{`node skills/countersign/scripts/countersign.mjs status ${v.versionId} --verify-local --json`}</pre>
      <p className="small muted">
        Recomputed from chain data at block {r.computedAtBlock ?? "?"} with <code>{r.ruleset}</code>. The same command
        checks it independently of this site.
      </p>
    </>
  );
}
