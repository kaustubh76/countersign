import Link from "next/link";
import { checkSkill } from "@countersign/redline";
import { CodeBlock, CommandChip } from "@/components/CodeBlock";
import { HeroArt } from "@/components/HeroArt";
import { LiveStrip } from "@/components/LiveStrip";
import { ATTACK_SAMPLE_NAME, attackSampleFiles } from "@/lib/attackSample";
import { getChainPulse } from "@/lib/chain";
import { getIndex } from "@/lib/data";
import { STATUS_LABELS } from "@/lib/reasons";
import { INSTALL_CMD, REPO_URL, RULESET, SITE_URL } from "@/lib/site";

export const revalidate = 60;

const ATTACKS = [
  { id: "bot-farm", title: "Spin up 1,000 bot wallets", stop: "Contract: no Agent ID, no countersign" },
  { id: "friend", title: "Ask a friend to vouch", stop: "C3: they never touched the author's contract" },
  { id: "borrow", title: "Cite someone else's transactions", stop: "C2: not sent by the countersigner" },
  { id: "shared-token", title: "Count ordinary token approvals", stop: "C3: anchors must be author-owned" },
  { id: "self", title: "Countersign your own skill", stop: "Contract: SelfCountersign" },
  { id: "smear", title: "Smear a rival from your own wallet", stop: "A claim, never a verified incident" },
];

const COMPARE: { q: string; downloads: string; votes: string; countersign: string }[] = [
  {
    q: "Who can add one?",
    downloads: "Anyone. Any script.",
    votes: "Anyone with an account, even if they never ran the skill.",
    countersign: "Only an Agent ID holder whose own wallet used this exact version.",
  },
  {
    q: "What backs it?",
    downloads: "Nothing.",
    votes: "An opinion.",
    countersign: "Their own successful transactions to the author's contract, cited on-chain.",
  },
  {
    q: "Can anyone re-check it?",
    downloads: "No.",
    votes: "The vote, not the reason.",
    countersign: "Yes. Every cited transaction, from chain data, with an open-source verifier.",
  },
  {
    q: "Can a rival smear you?",
    downloads: "They can bot yours down the list.",
    votes: "Yes, with one flag.",
    countersign: "A report stays a claim unless it rests on evidence nobody can fake from their own wallet.",
  },
];

export default async function Home() {
  const [index, pulse] = await Promise.all([getIndex(), getChainPulse().catch(() => null)]);
  const sample = checkSkill(attackSampleFiles());
  const failed = sample.results.filter((r) => !r.passed);
  const advisories = sample.results.filter((r) => r.passed && r.findings.length > 0);

  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="eyebrow rise">Proof-of-use trust for AI-agent skills</div>
            <h1 className="rise" style={{ animationDelay: "0.05s" }}>
              <span className="line">Download counts can be faked.</span> <span className="line">Proof of use <em>can&apos;t.</em></span>
            </h1>
            <p className="lead rise" style={{ animationDelay: "0.12s" }}>
              COUNTERSIGN counts, for each exact version of a skill, the distinct <strong>Agent ID holders</strong> whose{" "}
              <strong>own wallets</strong> used it cleanly and then countersigned it. Every count is re-checked from BNB
              Smart Chain data. Not votes. Not downloads.
            </p>
            <div className="row hero-cta rise" style={{ animationDelay: "0.2s" }}>
              <Link className="btn" href="/try">
                Try to fake it <span className="arrow">→</span>
              </Link>
              <Link className="btn ghost" href="/check">
                Check a skill
              </Link>
            </div>
            <div className="rise" style={{ animationDelay: "0.28s" }}>
              <CommandChip cmd={INSTALL_CMD} />
              <p className="tiny faint" style={{ marginTop: 8 }}>
                The companion skill for agents that use the Binance Agentic Wallet. It never signs: every transaction is a
                preview you confirm.
              </p>
            </div>
          </div>
          <HeroArt />
        </div>
        <div className="wrap hero-live">
          <LiveStrip initial={pulse} />
        </div>
      </section>

      {/* ── why votes fail ──────────────────────────────────────────────────────────────────── */}
      <section className="block">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">The problem</div>
            <h2>
              Every signal your agent trusts can be <em>botted.</em>
            </h2>
            <p>
              A backdoored skill was pushed to the top of a public marketplace with bot-inflated downloads (
              <a href="https://dev.to/tomleelive/the-clawhub-malware-incident-a-first-warning-for-ai-agent-supply-chains-2icd" rel="noreferrer">
                write-up
              </a>
              ). Stars, votes and flags have the same flaw: they cost nothing, and nobody has to have used the skill. A
              countersign costs a real Agent ID <em>and</em> a real session.
            </p>
          </div>
          <div className="table-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th />
                  <th>Downloads &amp; stars</th>
                  <th>Votes &amp; flags</th>
                  <th className="cs">Countersign</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.q}>
                    <td className="q">{r.q}</td>
                    <td className="no">
                      <span className="mark">✗</span>
                      {r.downloads}
                    </td>
                    <td className="no">
                      <span className="mark">✗</span>
                      {r.votes}
                    </td>
                    <td className="yes">
                      <span className="mark">✓</span>
                      {r.countersign}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── how it works ────────────────────────────────────────────────────────────────────── */}
      <section className="block">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How a countersign is earned</div>
            <h2>
              Declare. Check. <em>Prove.</em>
            </h2>
            <p>Three steps, all in the agent, all from the user&apos;s and the author&apos;s own Agent ID wallets.</p>
          </div>
          <div className="grid three steps-grid">
            <div className="card step">
              <div className="step-n">01</div>
              <h3>The author declares what the skill may do</h3>
              <p className="muted small">
                <code>countersign.json</code> lists the contracts, functions and value caps the skill uses, plus every
                approval and transfer with a cap. The exact version is registered from the author&apos;s Agent ID wallet.
              </p>
              <CodeBlock label="author" code={"countersign register ./my-skill \\\n  --uri https://github.com/…/tree/<commit>/my-skill"} />
            </div>
            <div className="card step">
              <div className="step-n">02</div>
              <h3>Every wallet call is checked first</h3>
              <p className="muted small">
                Before each preview in the Binance Agentic Wallet, the user&apos;s agent checks the call against the
                manifest. Undeclared spender or uncapped approval: blocked. The user confirms everything.
              </p>
              <CodeBlock label="user's agent" copy={false}>
                <span className="p">$ </span>countersign check-call --to 0x… --data 0x095e…{"\n"}
                <span className="bad">✗ block</span> approval to an undeclared spender
              </CodeBlock>
            </div>
            <div className="card step">
              <div className="step-n">03</div>
              <h3>Clean sessions are countersigned</h3>
              <p className="muted small">
                The countersign cites the session&apos;s own transactions. Anyone can re-check that they came from that
                wallet, stayed inside the manifest and touched the author&apos;s own contract within 48 hours.
              </p>
              <CodeBlock label="user's agent" copy={false}>
                <span className="p">$ </span>countersign session end{"\n"}
                <span className="ok">✓ clean</span> 3 of 3 txs seen, in-manifest, anchor hit
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      {/* ── try to fake it ──────────────────────────────────────────────────────────────────── */}
      <section className="block attack-block">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Play the attacker</div>
            <h2>
              Try to fake it. <em>We&apos;ll wait.</em>
            </h2>
            <p>
              Six ways people fake trust signals, run against the real verifier ({RULESET}) in your browser on a simulated
              chain. Every one of them is stopped, and the page shows exactly which rule stopped it.
            </p>
          </div>
          <div className="attack-grid">
            {ATTACKS.map((a, i) => (
              <Link key={a.id} href={`/try?s=${a.id}`} className="attack rise" style={{ animationDelay: `${0.05 * i}s` }}>
                <span className="attack-n">0{i + 1}</span>
                <span className="attack-title">{a.title}</span>
                <span className="attack-stop">✗ {a.stop}</span>
              </Link>
            ))}
          </div>
          <div className="row" style={{ marginTop: 28 }}>
            <Link className="btn" href="/try">
              Open the playground <span className="arrow">→</span>
            </Link>
            <span className="muted small">Simulated chain, real verifier code. Nothing is sent anywhere.</span>
          </div>
        </div>
      </section>

      {/* ── blocked before you sign ─────────────────────────────────────────────────────────── */}
      <section className="block">
        <div className="wrap split">
          <div>
            <div className="eyebrow">Before you install</div>
            <h2>
              Blocked <em>before</em> the wallet even previews it.
            </h2>
            <p className="lead">
              The Red-Line Check reads a skill&apos;s files for the hackathon&apos;s red lines: confirmation bypass,
              uncapped approvals, undeclared recipients, wallet-secret requests, brand impersonation and promised returns.
              Here it is on <code>{ATTACK_SAMPLE_NAME}</code>, the &quot;4,000+ downloads&quot; skill from the
              illustration above.
            </p>
            <div className="row">
              <Link className="btn ghost" href="/check?sample=attack">
                See the full report
              </Link>
              <Link className="btn ghost" href="/check">
                Check your own skill
              </Link>
            </div>
          </div>
          <CodeBlock label={`check-install ${ATTACK_SAMPLE_NAME} · real output`} copy={false}>
            <span className="p">$ </span>countersign check-install ./{ATTACK_SAMPLE_NAME}
            {"\n"}
            {failed.map((r) => (
              <span key={r.rule}>
                {"\n"}
                <span className="bad">✗ {r.rule}</span> {r.title.toLowerCase()}
                {r.findings.map((f, i) => (
                  <span key={i} className="c">
                    {"\n"}
                    {"    "}
                    {f.file}:{f.line} · {f.message}
                  </span>
                ))}
              </span>
            ))}
            {advisories.map((r) => (
              <span key={r.rule}>
                {"\n"}
                <span className="warn">! {r.rule}</span> {r.title.toLowerCase()}
              </span>
            ))}
            {"\n\n"}
            <span className="bad">verdict: BLOCK</span>
            <span className="c"> · not registered · nobody has countersigned it</span>
          </CodeBlock>
        </div>
      </section>

      {/* ── launch / live numbers ───────────────────────────────────────────────────────────── */}
      <section className="block" id="live">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">{index.deployed ? "Live on BNB Smart Chain" : "Mainnet launch"}</div>
            <h2>{index.deployed ? <>Numbers read from chain, never typed in.</> : <>What&apos;s live, and what switches on at deploy.</>}</h2>
          </div>
          {index.deployed ? (
            <>
              <div className="grid three">
                <div className="card stat ok">
                  <div className="n">{index.totals.counted}</div>
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
              {index.error ? <p className="notice">Could not refresh from chain just now ({index.error}); showing the last good data.</p> : null}
              <h3 style={{ margin: "36px 0 12px" }}>Skill versions</h3>
              {index.versions.length === 0 ? (
                <p className="muted">No skill versions registered yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Skill</th>
                        <th>Status</th>
                        <th className="num">Verified</th>
                        <th className="num">Incidents</th>
                        <th>Red-Line</th>
                        <th>Registered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {index.versions.map((v) => (
                        <tr key={v.versionId}>
                          <td>
                            <Link href={`/s/${v.versionId}`}>{v.name}</Link>
                            <div className="hash">{v.versionId.slice(0, 18)}…</div>
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
                </div>
              )}
              <p className="tiny faint" style={{ marginTop: 12 }}>
                Refreshed {index.computedAt.replace("T", " ").slice(0, 19)} UTC{index.computedAtBlock ? ` at block ${index.computedAtBlock}` : ""} · {RULESET}
              </p>
            </>
          ) : (
            <div className="grid two">
              <div className="card">
                <div className="row tight" style={{ marginBottom: 12 }}>
                  <span className="dot live" />
                  <h3 style={{ margin: 0 }}>Live now</h3>
                </div>
                <ul className="checklist">
                  <li>
                    <Link href="/try">The verifier playground</Link>: the real ruleset, running in your browser
                  </li>
                  <li>
                    <Link href="/check">The Red-Line Check</Link>: GitHub folders, local folders, samples
                  </li>
                  <li>
                    <Link href="/authors">The countersign.json builder</Link> for skill authors
                  </li>
                  <li>
                    The companion skill v1.0.0 and its source:{" "}
                    <a href={REPO_URL} rel="noreferrer">
                      GitHub
                    </a>
                  </li>
                  <li>A live read of BNB Smart Chain and the Agent ID registry (the strip at the top)</li>
                </ul>
              </div>
              <div className="card">
                <div className="row tight" style={{ marginBottom: 12 }}>
                  <span className="dot wait" />
                  <h3 style={{ margin: 0 }}>Switches on at deploy</h3>
                </div>
                <ul className="checklist pending">
                  <li>SkillRegistry and Countersign on BNB Smart Chain, verified on BscScan</li>
                  <li>Registering skill versions from Agent ID wallets</li>
                  <li>On-chain countersigns, and the verified counts shown here</li>
                  <li>README badges and the per-version pages</li>
                </ul>
                <p className="tiny faint" style={{ marginTop: 14 }}>
                  Every number on this page will be read from chain and recomputed with {RULESET}. None of it is typed in.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── for agents & marketplaces ───────────────────────────────────────────────────────── */}
      <section className="block">
        <div className="wrap split">
          <div>
            <div className="eyebrow">For agents &amp; marketplaces</div>
            <h2>
              Choose skills by <em>proof,</em> not popularity.
            </h2>
            <p className="lead">
              A counts-only API and a README badge. No wallets, no handles, no per-person data. And it&apos;s only a cache:
              <code> countersign status &lt;versionId&gt; --verify-local</code> recomputes the same report from chain data.
            </p>
            <Link className="btn ghost" href="/docs">
              API reference
            </Link>
          </div>
          <CodeBlock label="api" code={`curl ${SITE_URL}/api/v1/version/<versionId>\ncurl ${SITE_URL}/api/v1/stats\n\n![countersign](${SITE_URL}/api/v1/badge/<versionId>.svg)`} />
        </div>
      </section>
    </>
  );
}
