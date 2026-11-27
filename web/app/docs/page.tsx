import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { getChainPulse } from "@/lib/chain";
import { getIndex } from "@/lib/data";
import { bscscan, INSTALL_CMD, REPO_URL, RULESET, SITE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Docs & API", description: "The COUNTERSIGN ruleset, the on-chain guarantees, the counts-only API, and how to verify everything yourself." };
export const revalidate = 300;

const RULES: { id: string; kind: "counts" | "incident" | "claim"; title: string; body: string }[] = [
  { id: "C1", kind: "counts", title: "Canonical content", body: "The files at contentURI (a GitHub folder pinned to a commit) re-hash to the registered contentHash, their countersign.json encodes to the registered manifestHash, and it names the registrant as publisher. Reported per version; a copy registered by someone else is flagged." },
  { id: "C2", kind: "counts", title: "Valid citations", body: "Every cited transaction succeeded on BNB Smart Chain, was sent by the countersigner's own wallet, was mined after the version was registered and at most 48 h (384,000 blocks) before the countersign, called a declared function on a declared contract within its value cap, and that contract's code has not changed." },
  { id: "C3", kind: "counts", title: "Anchor hit", body: "At least one cited transaction succeeded against an endorsed anchor: a contract the author provably owns (its owner() endorsed it). Shared tokens and routers can't carry a countersign." },
  { id: "C4", kind: "counts", title: "Effects inside the manifest", body: "Every approval the countersigner granted in those transactions matches a declared flow within its cap, and every direct token transfer goes to a declared recipient within its cap. Swaps paying a pool are fine." },
  { id: "C5", kind: "counts", title: "Independence", body: "The countersigner is not the author or an anchor endorser and did not also report the version. Reciprocal author pairs (\"you countersign mine, I countersign yours\") go to a separate peer count." },
  { id: "I1", kind: "incident", title: "Drift", body: "A declared contract's code, or its declared EIP-1967 implementation, changed after registration." },
  { id: "I2", kind: "incident", title: "Author pull", body: "A transaction sent by the author moved or approved the reporter's assets outside a declared pull flow. The evidence is the author's own signature." },
  { id: "I3", kind: "incident", title: "Static finding", body: "The published, hashed files fail the Red-Line rules for confirmation bypass (RL2), uncapped or undeclared transfers (RL3), wallet-secret requests (RL6) or pairing outside the official app (RL1)." },
  { id: "—", kind: "claim", title: "Every other report", body: "Shown as an unverified claim, never decisive. Three or more independent reporters with real sessions raise a warning, never an incident." },
];

export default async function Docs() {
  const [index, pulse] = await Promise.all([getIndex(), getChainPulse().catch(() => null)]);
  const c = index.contracts;
  return (
    <div className="page-docs wrap">
      <div className="eyebrow">Docs &amp; API</div>
      <h1 className="page">
        Everything here is <em>checkable.</em>
      </h1>
      <p className="lead">
        The rules that decide every count, what the contracts guarantee, and a counts-only API. The site is a cache: the open-source
        CLI recomputes the same numbers from chain data.
      </p>
      <nav className="toc">
        <a href="#ruleset">Ruleset</a>
        <a href="#onchain">On-chain guarantees</a>
        <a href="#api">API</a>
        <a href="#users">For users</a>
        <a href="#contracts">Contracts</a>
        <a href="#privacy">Privacy</a>
      </nav>

      <section id="ruleset" className="doc-sec">
        <h2>
          Ruleset <em>{RULESET.split("/")[1]}</em>
        </h2>
        <p className="muted">
          <code>{RULESET}</code> decides, from chain data alone, whether each countersign counts and whether a version has a verified
          incident. Deterministic: the same chain state gives the same result. Try it against a simulated chain in the{" "}
          <Link href="/try">playground</Link>.
        </p>
        <div className="rules">
          {RULES.map((r) => (
            <div key={r.id + r.title} className={`rule-row ${r.kind}`}>
              <span className="rule-id">{r.id}</span>
              <div>
                <div className="tt">
                  {r.title}{" "}
                  <span className={`pill ${r.kind === "counts" ? "ok" : r.kind === "incident" ? "bad" : "warn"}`}>
                    {r.kind === "counts" ? "must hold to count" : r.kind === "incident" ? "verified incident" : "claim"}
                  </span>
                </div>
                <div className="td">{r.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="onchain" className="doc-sec">
        <h2>
          On-chain <em>guarantees</em>
        </h2>
        <ul className="checklist">
          <li>
            The caller&apos;s Agent ID is resolved on-chain: <code>handleOf(msg.sender)</code>, then <code>tokenId = keccak256(handle)</code>, then{" "}
            <code>ownerOf(tokenId) == msg.sender</code>. No handle is ever passed in.
          </li>
          <li>One countersign per Agent ID per version. The author cannot countersign their own skill.</li>
          <li>Each transaction can be cited once per Agent ID, across every version. A countersign cites 1 to 8 transactions.</li>
          <li>
            The author&apos;s Agent ID is part of the version id: <code>keccak256(contentHash, manifestHash, registrantAgentId)</code>.
          </li>
          <li>Unlimited caps are rejected at registration. Neither contract holds funds, moves assets, pauses or upgrades.</li>
        </ul>
      </section>

      <section id="api" className="doc-sec">
        <h2>
          The <em>API</em>
        </h2>
        <p className="muted">Counts only: no wallets, no handles, no per-person data. CORS is open, so agents and marketplaces can call it directly.</p>
        <div className="api-list">
          {[
            ["GET", "/api/v1/stats", "totals: versions, verified countersigns, distinct Agent IDs"],
            ["GET", "/api/v1/versions", "every registered version with its counts"],
            ["GET", "/api/v1/version/<versionId>", "the verified report for one version"],
            ["GET", "/api/v1/badge/<versionId>.svg", "README and marketplace badge"],
            ["GET", "/api/v1/chain", "current BNB Smart Chain block, the Agent ID registry, deploy status"],
            ["POST", "/api/v1/check", "Red-Line Check of a commit-pinned GitHub folder: {\"uri\": \"…\"}"],
          ].map(([m, p, d]) => (
            <div key={p} className="api-row">
              <span className={`pill ${m === "GET" ? "ok" : "seal"}`}>{m}</span>
              <code>{p}</code>
              <span className="muted small">{d}</span>
            </div>
          ))}
        </div>
        <div className="grid two" style={{ marginTop: 16 }}>
          <CodeBlock label="try it" code={`curl ${SITE_URL}/api/v1/chain\ncurl ${SITE_URL}/api/v1/stats\ncurl -X POST ${SITE_URL}/api/v1/check \\\n  -H 'content-type: application/json' \\\n  -d '{"uri":"https://github.com/<owner>/<repo>/tree/<commit>/<skill>"}'`} />
          <CodeBlock label="GET /api/v1/chain · rendered at build" copy={false} code={pulse ? JSON.stringify(pulse, null, 2) : "chain unreachable at build time"} />
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          The API is a cache. <code>countersign status &lt;versionId&gt; --verify-local</code> recomputes the same report from chain data with
          no trust in this site.
        </p>
      </section>

      <section id="users" className="doc-sec">
        <h2>
          For <em>users</em>
        </h2>
        <p className="muted">Install the companion skill next to the Binance Agentic Wallet skill:</p>
        <CodeBlock code={INSTALL_CMD} />
        <p className="small muted" style={{ marginTop: 12 }}>
          Your agent then checks a skill before first use, checks every wallet call against the skill&apos;s declared permissions before the
          preview, and offers a countersign after a clean session. You confirm every transaction in chat; it never signs for you. A
          countersign is public: it permanently links your wallet (and its Agent ID) to that skill version, and the agent tells you so
          before you confirm. Skill authors: see <Link href="/authors">For authors</Link>.
        </p>
      </section>

      <section id="contracts" className="doc-sec">
        <h2>
          The <em>contracts</em>
        </h2>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <td>SkillRegistry</td>
                <td>{c ? <a className="hash" href={`${bscscan("address", c.skillRegistry)}#code`}>{c.skillRegistry}</a> : <span className="pill seal">launching</span>}</td>
              </tr>
              <tr>
                <td>Countersign</td>
                <td>{c ? <a className="hash" href={`${bscscan("address", c.countersign)}#code`}>{c.countersign}</a> : <span className="pill seal">launching</span>}</td>
              </tr>
              <tr>
                <td>Agent ID (upstream, SPACE ID)</td>
                <td>
                  <a className="hash" href={bscscan("address", "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F")}>0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Owner powers: the SkillRegistry owner can only rotate the attester key (and transfer or renounce ownership). The attester can
          only attest or revoke Red-Line attestations, which cache a check anyone can re-run. Countersign has no owner. Full threat model,
          including the trust placed in the upstream Agent ID registry:{" "}
          <a href={`${REPO_URL}/blob/main/docs/threat-model.md`} rel="noreferrer">
            docs/threat-model.md
          </a>
          .
        </p>
      </section>

      <section id="privacy" className="doc-sec">
        <h2>
          <em>Privacy</em>
        </h2>
        <p className="muted">
          This site and its API show counts only. They never show which wallet or which Agent ID used which skill, and offer no lookup by
          name or by wallet. On-chain, countersign records are public and map to wallets, which is why the companion warns you before
          you sign one.
        </p>
      </section>
    </div>
  );
}
