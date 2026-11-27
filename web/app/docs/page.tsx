import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Stamp } from "@/components/Stamp";
import { getChainPulse } from "@/lib/chain";
import { getIndex } from "@/lib/data";
import { bscscan, INSTALL_CMD, REPO_URL, RULESET, SITE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Docs", description: "The COUNTERSIGN ruleset, on-chain guarantees, counts-only API, and how to verify everything yourself." };
export const revalidate = 300;

const RULES: { id: string; kind: "counts" | "incident" | "claim"; title: string; body: string }[] = [
  { id: "C1", kind: "counts", title: "Canonical content", body: "The files at the commit-pinned GitHub URL re-hash to the registered content hash, and countersign.json names the registrant as publisher." },
  { id: "C2", kind: "counts", title: "Valid citations", body: "Each cited tx succeeded on BNB Smart Chain, came from the countersigner's wallet, within 48 h, calling a declared function on a declared contract within its value cap." },
  { id: "C3", kind: "counts", title: "Author's contract", body: "At least one cited tx hit an endorsed anchor: a contract whose owner() is the author. Shared tokens and routers can't carry a countersign." },
  { id: "C4", kind: "counts", title: "Inside the manifest", body: "Every approval and direct transfer matches a declared flow within its cap. Swaps paying a pool are fine." },
  { id: "C5", kind: "counts", title: "Independent signer", body: "Not the author, an endorser, or a reporter. Reciprocal author pairs go to a separate peer count." },
  { id: "I1", kind: "incident", title: "Drift", body: "A declared contract's code, or its declared proxy implementation, changed after registration." },
  { id: "I2", kind: "incident", title: "Author pull", body: "A tx sent by the author moved or approved the reporter's assets outside a declared pull flow." },
  { id: "I3", kind: "incident", title: "Static finding", body: "The published files fail RL1, RL2, RL3 or RL6. The check reads instructions, not topics: saying you never do something is fine." },
  { id: "—", kind: "claim", title: "Any other report", body: "Shown as a claim, never decisive. Three independent reporters with real sessions raise a warning, never an incident." },
];

const API: [string, string, string][] = [
  ["GET", "/api/v1/stats", "totals"],
  ["GET", "/api/v1/versions", "every version with its counts"],
  ["GET", "/api/v1/version/<id>", "one verified report"],
  ["GET", "/api/v1/badge/<id>.svg", "README badge"],
  ["GET", "/api/v1/chain", "live block, registry, deploy status"],
  ["POST", "/api/v1/check", "Red-Line Check of a GitHub folder"],
];

export default async function Docs() {
  const [index, pulse] = await Promise.all([getIndex(), getChainPulse().catch(() => null)]);
  const c = index.contracts;
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>Docs.</h1>
          <p className="mono-line">every number here can be recomputed from chain data with the open-source CLI</p>
          <nav className="toc">
            <a href="#ruleset">Ruleset</a>
            <a href="#onchain">On-chain</a>
            <a href="#api">API</a>
            <a href="#install">Install</a>
            <a href="#contracts">Contracts</a>
            <a href="#privacy">Privacy</a>
          </nav>
        </div>
      </section>
      <div className="wrap page-body">
        <section id="ruleset" className="doc-sec" style={{ paddingTop: 0 }}>
          <h2>{RULESET}</h2>
          <p>
            Decides from chain data alone whether a countersign counts. Same chain state, same result. Try it in the <Link href="/try">playground</Link>.
          </p>
          {RULES.map((r) => (
            <div key={r.id + r.title} className={`rule-row ${r.kind}`}>
              <span className="rule-id">{r.id}</span>
              <div>
                <div className="tt">{r.title}</div>
                <div className="td">{r.body}</div>
              </div>
              <Stamp kind={r.kind === "counts" ? "ok" : r.kind === "incident" ? "bad" : "warn"}>{r.kind === "counts" ? "to count" : r.kind === "incident" ? "incident" : "claim"}</Stamp>
            </div>
          ))}
        </section>

        <section id="onchain" className="doc-sec">
          <h2>On-chain</h2>
          <ul className="plain">
            <li>
              The caller&apos;s Agent ID is resolved on-chain: <code>handleOf(msg.sender)</code> → <code>keccak256(handle)</code> → <code>ownerOf</code>. No handle is passed in.
            </li>
            <li>One countersign per Agent ID per version. Authors can&apos;t countersign their own skill.</li>
            <li>Each tx can be cited once per Agent ID, across all versions.</li>
            <li>The version id includes the author&apos;s Agent ID. Unlimited caps are rejected at registration.</li>
            <li>Neither contract holds funds, moves assets, pauses or upgrades.</li>
          </ul>
        </section>

        <section id="api" className="doc-sec">
          <h2>API</h2>
          <p>Counts only. No wallets, no handles. CORS open. It&apos;s a cache: the CLI recomputes the same numbers.</p>
          {API.map(([m, path, d]) => (
            <div key={path} className="api-row">
              <span className={`m ${m === "POST" ? "post" : ""}`}>{m}</span>
              <code>{path}</code>
              <span className="dim small">{d}</span>
            </div>
          ))}
          <div className="two-col" style={{ marginTop: 20 }}>
            <CodeBlock label="try it" code={`curl ${SITE_URL}/api/v1/chain\ncurl ${SITE_URL}/api/v1/stats\n\n![countersign](${SITE_URL}/api/v1/badge/<id>.svg)`} />
            <CodeBlock label="GET /api/v1/chain" copy={false} code={pulse ? JSON.stringify(pulse, null, 2) : "chain unreachable at build"} />
          </div>
        </section>

        <section id="install" className="doc-sec">
          <h2>Install</h2>
          <CodeBlock code={INSTALL_CMD} />
          <p className="small dim" style={{ marginTop: 12 }}>
            Next to the Binance Agentic Wallet skill. It checks skills and calls, and offers a countersign after a clean session. You confirm every
            transaction. A countersign is public: it links your wallet to that skill version, and the agent says so first.
          </p>
        </section>

        <section id="contracts" className="doc-sec">
          <h2>Contracts</h2>
          <div className="ledger">
            <div className="ledger-row">
              <span className="k">SkillRegistry</span>
              <span className="leader" />
              {c ? <a className="hash" href={`${bscscan("address", c.skillRegistry)}#code`}>{c.skillRegistry}</a> : <span className="v seal">launching</span>}
            </div>
            <div className="ledger-row">
              <span className="k">Countersign</span>
              <span className="leader" />
              {c ? <a className="hash" href={`${bscscan("address", c.countersign)}#code`}>{c.countersign}</a> : <span className="v seal">launching</span>}
            </div>
            <div className="ledger-row">
              <span className="k">Agent ID (SPACE ID, upstream)</span>
              <span className="leader" />
              <a className="hash" href={bscscan("address", "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F")}>0x60B9…022F</a>
            </div>
          </div>
          <p className="small dim" style={{ marginTop: 14 }}>
            The registry owner can only rotate the attester key. Countersign has no owner. Full{" "}
            <a href={`${REPO_URL}/blob/main/docs/threat-model.md`} rel="noreferrer">
              threat model
            </a>
            .
          </p>
        </section>

        <section id="privacy" className="doc-sec">
          <h2>Privacy</h2>
          <p>This site shows counts only and never looks anyone up by name or wallet. On-chain, countersigns are public, which is why the agent warns you before you sign.</p>
        </section>
      </div>
    </>
  );
}
