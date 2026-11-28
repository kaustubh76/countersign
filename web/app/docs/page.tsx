import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Stamp } from "@/components/Stamp";
import type { ApiEndpoint } from "@/lib/apiConsole";
import { getChainPulse } from "@/lib/chain";
import { getIndex } from "@/lib/data";
import { HowItFits } from "@/components/HowItFits";
import { bscscan, COMMIT_SHA, INSTALL_CMD, REPO_URL, RULESET, SITE_URL } from "@/lib/site";
import { ApiConsole } from "./ApiConsole";

export const metadata: Metadata = { title: "Docs", description: "The COUNTERSIGN ruleset, on-chain guarantees, counts-only API, and how to verify everything yourself." };
export const revalidate = 300;

const RULES: { id: string; kind: "counts" | "incident" | "claim" | "signal"; title: string; body: string }[] = [
  { id: "C1", kind: "counts", title: "Canonical content", body: "The files at the commit-pinned GitHub URL re-hash to the registered content hash, and countersign.json names the registrant as publisher." },
  { id: "C2", kind: "counts", title: "Valid citations", body: "Each cited tx succeeded on BNB Smart Chain, came from the countersigner's wallet, within 48 h, calling a declared function on a declared contract within its value cap." },
  { id: "C3", kind: "counts", title: "Author's contract", body: "At least one cited tx hit an endorsed anchor: a contract whose owner() is the author. Shared tokens and routers can't carry a countersign." },
  { id: "C4", kind: "counts", title: "Inside the manifest", body: "Every approval and direct transfer matches a declared flow within its cap. Swaps paying a pool are fine." },
  { id: "C5", kind: "counts", title: "Independent signer", body: "Not the author, an endorser, or a reporter. Reciprocal author pairs go to a separate peer count." },
  { id: "I1", kind: "incident", title: "Drift", body: "A declared contract's code, or its declared proxy implementation, changed after registration." },
  { id: "I2", kind: "incident", title: "Author pull", body: "A tx sent by the author moved or approved the reporter's assets outside a declared pull flow." },
  { id: "I3", kind: "incident", title: "Static finding", body: "The published files fail RL1, RL2, RL3 or RL6. The check reads instructions, not topics: saying you never do something is fine." },
  { id: "—", kind: "claim", title: "Any other report", body: "Shown as a claim, never decisive. Three independent reporters with real sessions raise a warning, never an incident." },
  { id: "W1", kind: "signal", title: "Established", body: "Counted countersigners who also countersigned another author's skill: a second number that friend networks can't raise." },
  { id: "G", kind: "signal", title: "Guarded", body: "The author's contract trusts the GuardedExecutor, so calls routed through it revert on-chain unless the manifest declares them." },
];

/** countersign.redline/v1: what each rule reads (wording kept descriptive so this page passes its own check). */
const REDLINE: { id: string; title: string; body: string; harmful: boolean }[] = [
  { id: "RL1", title: "Pairing stays in the Binance App", body: "Asking for a pairing code, or a QR login on a website.", harmful: true },
  { id: "RL2", title: "You confirm every asset action", body: "Wording that skips, hides or automates the confirmation step.", harmful: true },
  { id: "RL3", title: "Capped approvals, declared recipients", body: "Maximum-integer allowances, addresses nothing declares, timed transfers to fixed addresses.", harmful: true },
  { id: "RL4", title: "Owner powers disclosed", body: "Mint, fee, pause, blacklist, withdraw and upgrade powers in your contracts' verified source, each said in SKILL.md.", harmful: false },
  { id: "RL5", title: "No brand impersonation", body: "Lookalike brand domains, brand words in the skill's name.", harmful: false },
  { id: "RL6", title: "Wallet secrets stay with you", body: "Asking for recovery words or keys; code that reads the wallet's session files.", harmful: true },
  { id: "RL7", title: "No promised returns", body: "Wording that promises profit.", harmful: false },
  { id: "RL8", title: "Risk warning on trading skills", body: "Advisory only.", harmful: false },
];

/** Until a version is registered, the id endpoints are tried with an all-zero id (an honest "not registered"). */
const ZERO_ID = `0x${"0".repeat(64)}`;

export default async function Docs() {
  const [index, pulse] = await Promise.all([getIndex(), getChainPulse().catch(() => null)]);
  const c = index.contracts;
  const versionId = index.versions[0]?.versionId ?? ZERO_ID;
  // Our own skill folder at the commit this page was built from (it passes its own check).
  const selfSkill = /^[0-9a-f]{40}$/.test(COMMIT_SHA) ? `${REPO_URL}/tree/${COMMIT_SHA}/skills/countersign` : "https://github.com/<owner>/<repo>/tree/<commit>/<skill-folder>";
  const endpoints: ApiEndpoint[] = [
    { method: "GET", path: "/api/v1/chain", desc: "live block, registry, deploy status" },
    { method: "GET", path: "/api/v1/stats", desc: "totals" },
    { method: "GET", path: "/api/v1/versions", desc: "every version with its counts" },
    { method: "GET", path: "/api/v1/version/<id>", desc: "one verified report", param: versionId },
    { method: "GET", path: "/api/v1/badge/<id>.svg", desc: "README badge", param: versionId },
    { method: "POST", path: "/api/v1/check", desc: "Red-Line Check of a GitHub folder", body: JSON.stringify({ uri: selfSkill }, null, 2) },
  ];
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>Docs.</h1>
          <p className="mono-line">every number here can be recomputed from chain data with the open-source CLI</p>
          <nav className="toc">
            <a href="#fits">How it fits</a>
            <a href="#ruleset">Ruleset</a>
            <a href="#redline">Red-Line rules</a>
            <a href="#onchain">On-chain</a>
            <a href="#api">API</a>
            <a href="#install">Install</a>
            <a href="#contracts">Contracts</a>
            <a href="#privacy">Privacy</a>
          </nav>
        </div>
      </section>
      <div className="wrap page-body">
        <section id="fits" className="doc-sec" style={{ paddingTop: 0 }}>
          <h2>How it fits</h2>
          <HowItFits registry={c?.skillRegistry} countersign={c?.countersign} executor={c?.guardedExecutor} />
        </section>

        <section id="ruleset" className="doc-sec">
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
              <Stamp kind={r.kind === "counts" ? "ok" : r.kind === "incident" ? "bad" : r.kind === "signal" ? "idle" : "warn"}>
                {r.kind === "counts" ? "to count" : r.kind === "incident" ? "incident" : r.kind === "signal" ? "signal" : "claim"}
              </Stamp>
            </div>
          ))}
        </section>

        <section id="redline" className="doc-sec">
          <h2>countersign.redline/v1</h2>
          <p>
            The hackathon&apos;s red lines, run on a skill&apos;s files and its contracts&apos; verified source. A pass is attested on-chain and its report published.{" "}
            <Link href="/check">Run it</Link>.
          </p>
          {REDLINE.map((r) => (
            <div key={r.id} className={`rule-row ${r.harmful ? "incident" : "claim"}`}>
              <span className="rule-id">{r.id}</span>
              <div>
                <div className="tt">{r.title}</div>
                <div className="td">{r.body}</div>
              </div>
              <Stamp kind={r.harmful ? "bad" : "warn"}>{r.harmful ? "blocks" : "warns"}</Stamp>
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
            <li>Several Red-Line attesters; an attestation counts only while its attester is enabled and covered every harmful rule.</li>
            <li>Opt-in GuardedExecutor: a call routed through it reverts on-chain unless the version&apos;s manifest declares it.</li>
            <li>No COUNTERSIGN contract holds funds, moves assets, pauses or upgrades.</li>
          </ul>
        </section>

        <section id="api" className="doc-sec">
          <h2>API</h2>
          <p>Counts only. No wallets, no handles. CORS open. It&apos;s a cache: the CLI recomputes the same numbers.</p>
          <ApiConsole endpoints={endpoints} site={SITE_URL} initial={pulse ? JSON.stringify(pulse) : null} />
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
              <span className="k">GuardedExecutor</span>
              <span className="leader" />
              {c?.guardedExecutor ? <a className="hash" href={`${bscscan("address", c.guardedExecutor)}#code`}>{c.guardedExecutor}</a> : <span className="v seal">launching</span>}
            </div>
            <div className="ledger-row">
              <span className="k">Agent ID (SPACE ID, upstream)</span>
              <span className="leader" />
              <a className="hash" href={bscscan("address", "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F")}>0x60B9…022F</a>
            </div>
          </div>
          <p className="small dim" style={{ marginTop: 14 }}>
            The registry owner can only add or remove Red-Line attesters. Countersign and the GuardedExecutor have no owner. Full{" "}
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
