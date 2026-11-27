import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/CodeBlock";
import { getIndex } from "@/lib/data";
import { INCIDENT_LABELS, REASON_LABELS, shortHash, STATUS_LABELS } from "@/lib/reasons";
import { bscscan, SITE_URL } from "@/lib/site";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ versionId: string }> }): Promise<Metadata> {
  const { versionId } = await params;
  return { title: `Skill version ${versionId.slice(0, 10)}…` };
}

export default async function VersionPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(versionId)) notFound();
  const index = await getIndex();
  const v = index.versions.find((x) => x.versionId.toLowerCase() === versionId.toLowerCase());
  if (!v) notFound();
  const r = v.report;
  const rejected = Object.entries(r.countersigns.rejectionReasons).sort((a, b) => b[1] - a[1]);
  const attestation = r.attestation
    ? r.attestation.revoked
      ? { cls: "warn", text: "revoked" }
      : r.attestation.rulesPassed === r.attestation.rulesChecked
        ? { cls: "pass", text: "all checked rules passed" }
        : { cls: "fail", text: "some rules failed" }
    : { cls: "skip", text: "none yet" };
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
    {
      state: r.anchors.endorsed > 0 ? "pass" : "fail",
      title: `Anchors: ${r.anchors.endorsed} of ${r.anchors.declared} author-owned contracts endorsed`,
      detail: r.anchors.endorsed === 0 ? "no countersign can count until the author's own contract is endorsed" : "countersigns must cite a transaction to one of these",
    },
    {
      state: attestation.cls,
      title: `Red-Line attestation: ${attestation.text}`,
      detail: r.attestation ? <span className="hash">report {r.attestation.reportHash}</span> : "the check can be re-run by anyone on the published files",
    },
    {
      state: "info",
      title: `Countersign records: ${r.countersigns.total} submitted · ${r.countersigns.counted} counted · ${r.countersigns.peer} peer · ${r.countersigns.rejected} rejected`,
      detail: rejected.length ? (
        <ul className="reasons">
          {rejected.map(([code, n]) => (
            <li key={code}>
              {n}× {REASON_LABELS[code] ?? code}
            </li>
          ))}
        </ul>
      ) : (
        "every submitted countersign is shown in these totals, counted or not"
      ),
    },
  ];
  const badgeMd = `[![countersign](${SITE_URL}/api/v1/badge/${v.versionId}.svg)](${SITE_URL}/s/${v.versionId})`;

  return (
    <div className="page-version wrap">
      <div className="eyebrow">Skill version</div>
      <h1 className="page">{v.name}</h1>
      <div className="row tight">
        <span className={`pill ${v.status}`}>{STATUS_LABELS[v.status] ?? v.status}</span>
        <span className="hash">{v.versionId}</span>
      </div>

      <div className="grid three" style={{ marginTop: 28 }}>
        <div className="card stat ok">
          <div className="n">{r.countersigns.counted}</div>
          <div className="l">Agent ID holders whose own sessions were verified</div>
        </div>
        <div className={`card stat ${r.incidents.length ? "bad" : ""}`}>
          <div className="n">{r.incidents.length}</div>
          <div className="l">verified incidents</div>
        </div>
        <div className="card stat">
          <div className="n">{r.claims.total}</div>
          <div className="l">unverified reports{r.claims.corroborated ? " (corroborated by 3+ independent users)" : ""}</div>
        </div>
      </div>

      {r.incidents.length > 0 ? (
        <div className="card" style={{ marginTop: 18, borderColor: "var(--bad-line)" }}>
          <h3>Verified incidents</h3>
          <ul className="reasons">
            {r.incidents.map((i, n) => (
              <li key={n}>
                <strong>{INCIDENT_LABELS[i.kind] ?? i.kind}:</strong> {i.detail}
                {i.txHash ? (
                  <>
                    {" "}
                    (<a href={bscscan("tx", i.txHash)}>{shortHash(i.txHash)}</a>)
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 style={{ marginTop: 48 }}>
        What was <em>checked</em>
      </h2>
      <ol className="trace">
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
      <p className="tiny faint" style={{ marginTop: 10 }}>
        Registered at block {v.registeredBlock} ({v.registeredAt.slice(0, 10)}). Recomputed at block {r.computedAtBlock ?? "?"} with{" "}
        <code>{r.ruleset}</code>. <Link href="/docs#ruleset">What the rules mean</Link>.
      </p>

      <div className="grid two" style={{ marginTop: 40 }}>
        <div>
          <h3>Badge</h3>
          <p>
            <img src={`/api/v1/badge/${v.versionId}.svg`} alt="countersign badge" height={20} />
          </p>
          <CodeBlock label="markdown" code={badgeMd} />
        </div>
        <div>
          <h3>Verify it yourself</h3>
          <p className="muted small">The same report, recomputed from chain data with no trust in this site.</p>
          <CodeBlock code={`node skills/countersign/scripts/countersign.mjs status ${v.versionId} --verify-local --json`} />
        </div>
      </div>
    </div>
  );
}
