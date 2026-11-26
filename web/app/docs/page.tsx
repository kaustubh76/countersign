import { getIndex } from "@/lib/data";

export const metadata = { title: "Docs & API · COUNTERSIGN" };
export const revalidate = 300;

const REPO = process.env.NEXT_PUBLIC_REPO_URL ?? "";

export default async function Docs() {
  const index = await getIndex();
  const c = index.contracts;
  return (
    <>
      <h1>Docs &amp; API</h1>
      <p className="lead">Everything an agent, a marketplace or a skill author needs to use COUNTERSIGN.</p>

      <h2>For agents: choose skills by proof, not popularity</h2>
      <pre>{`GET /api/v1/version/<versionId>   → verified report (counts, incidents, claims, attestation)
GET /api/v1/versions              → every registered version with its counts
GET /api/v1/badge/<versionId>.svg → README / marketplace badge
GET /api/v1/stats                 → totals`}</pre>
      <p className="small muted">
        The API is a cache. <code>countersign status &lt;versionId&gt; --verify-local</code> recomputes the same report from
        chain data with no trust in this site. Responses contain counts only: no wallets, no handles, no per-person data.
      </p>

      <h2>For users</h2>
      <p>Install the companion skill next to the Binance Agentic Wallet skill:</p>
      <pre>{`npx skills add ${REPO || "<repo-url>"} --skill countersign`}</pre>
      <p className="small muted">
        Your agent then checks a skill before first use, checks every wallet call against the skill&apos;s declared
        permissions before preview, and offers a countersign after a clean session. You confirm every transaction.
      </p>

      <h2>For skill authors</h2>
      <ol>
        <li>
          Add a <code>countersign.json</code> permission manifest to your skill folder (
          <a href={`${REPO}/blob/main/docs/manifest-spec.md`}>spec</a>). Mark your own contract as the <code>anchor</code>.
        </li>
        <li>
          Run <code>countersign redline &lt;dir&gt;</code> (or the <a href="/check">web check</a>) and fix any findings.
        </li>
        <li>
          Register from your Agent ID wallet: <code>countersign register &lt;dir&gt; --uri &lt;github tree URL @ commit&gt;</code>, then preview and confirm.
        </li>
        <li>Put the badge in your README and ask real users to try the skill.</li>
      </ol>

      <h2>Contracts (BNB Smart Chain)</h2>
      {c ? (
        <table>
          <tbody>
            <tr>
              <td>SkillRegistry</td>
              <td>
                <a className="hash" href={`https://bscscan.com/address/${c.skillRegistry}#code`}>{c.skillRegistry}</a>
              </td>
            </tr>
            <tr>
              <td>Countersign</td>
              <td>
                <a className="hash" href={`https://bscscan.com/address/${c.countersign}#code`}>{c.countersign}</a>
              </td>
            </tr>
            <tr>
              <td>Agent ID (upstream)</td>
              <td>
                <a className="hash" href={`https://bscscan.com/address/${c.agentId}`}>{c.agentId}</a>
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="notice">Deploying.</p>
      )}
      <p className="small muted">
        Owner powers: the SkillRegistry owner can only rotate the attester key (and transfer or renounce ownership); the
        attester can only attest or revoke attestations. Countersign has no owner. Neither contract holds funds or can
        touch user assets. Full threat model: <a href={`${REPO}/blob/main/docs/threat-model.md`}>docs/threat-model.md</a>.
      </p>
    </>
  );
}
