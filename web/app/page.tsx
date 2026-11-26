import { getIndex } from "@/lib/data";
import { STATUS_LABELS } from "@/lib/reasons";

export const revalidate = 60;

export default async function Home() {
  const index = await getIndex();
  const humans = index.totals.counted;
  return (
    <>
      <h1>Download counts can be faked. Proof of use can&apos;t.</h1>
      <p className="lead">
        COUNTERSIGN counts, for each exact version of an AI-agent skill, the distinct <strong>Agent ID holders</strong>{" "}
        whose <strong>own wallets</strong> made successful calls to the author&apos;s contract within what the skill
        declared, then countersigned it. Every count is verified from BNB Smart Chain data, not from votes.
      </p>

      <h2>Live</h2>
      <div className="grid three">
        <div className="card stat">
          <div className="n">{humans}</div>
          <div className="l">verified countersigns, across all skill versions</div>
        </div>
        <div className="card stat">
          <div className="n">{index.uniqueAgents.countersign}</div>
          <div className="l">distinct Agent IDs that countersigned or reported</div>
        </div>
        <div className="card stat">
          <div className="n">{index.totals.versions}</div>
          <div className="l">registered skill versions ({index.uniqueAgents.registry} distinct authors)</div>
        </div>
      </div>
      {!index.deployed ? <p className="notice">Contracts are being deployed to BNB Smart Chain; live numbers appear here as soon as they are.</p> : null}
      {index.error ? <p className="notice">Could not refresh from chain just now ({index.error}); showing the last good data.</p> : null}

      <h2>How a countersign is earned</h2>
      <div className="grid three">
        <div className="card step">
          <div className="k">1 · declare</div>
          <h3>The author declares permissions</h3>
          <p className="muted small">
            <code>countersign.json</code> lists the contracts, functions and value caps the skill uses, and every approval
            and transfer with a cap. It is registered from the author&apos;s Agent ID wallet.
          </p>
        </div>
        <div className="card step">
          <div className="k">2 · check</div>
          <h3>Every wallet call is checked</h3>
          <p className="muted small">
            Before each preview in the Binance Agentic Wallet, the user&apos;s agent checks the call against the manifest:
            allow, warn or block. The user confirms everything.
          </p>
        </div>
        <div className="card step">
          <div className="k">3 · prove</div>
          <h3>Clean sessions are countersigned</h3>
          <p className="muted small">
            The countersign cites the session&apos;s transactions. Anyone can re-check that they came from that wallet,
            stayed inside the manifest and touched the author&apos;s own contract.
          </p>
        </div>
      </div>

      <h2>Skill versions</h2>
      {index.versions.length === 0 ? (
        <p className="muted">No skill versions registered yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Skill</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Verified</th>
              <th style={{ textAlign: "right" }}>Incidents</th>
              <th>Red-Line</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {index.versions.map((v) => (
              <tr key={v.versionId}>
                <td>
                  <a href={`/s/${v.versionId}`}>{v.name}</a>
                  <div className="hash muted">{v.versionId.slice(0, 18)}…</div>
                </td>
                <td>
                  <span className={`pill ${v.status}`}>{STATUS_LABELS[v.status] ?? v.status}</span>
                </td>
                <td className="num">{v.counted}</td>
                <td className="num">{v.incidents}</td>
                <td>
                  <span className={`pill ${v.attestation === "passed" ? "ok" : v.attestation === "none" ? "none" : "warning"}`}>{v.attestation}</span>
                </td>
                <td className="small muted">{v.registeredAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted">
        Refreshed {index.computedAt.replace("T", " ").slice(0, 19)} UTC{index.computedAtBlock ? ` at block ${index.computedAtBlock}` : ""}. Ruleset{" "}
        <code>countersign.ruleset/v1</code>.
      </p>
    </>
  );
}
