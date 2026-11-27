import Link from "next/link";
import { checkSkill } from "@countersign/redline";
import { AttackLedger } from "@/components/AttackLedger";
import { CommandChip } from "@/components/CodeBlock";
import { Flow } from "@/components/Flow";
import { HeroDuel } from "@/components/HeroDuel";
import { Stamp } from "@/components/Stamp";
import { TypedTerminal, type TermLine } from "@/components/TypedTerminal";
import { ATTACK_SAMPLE_NAME, attackSampleFiles } from "@/lib/attackSample";
import { getIndex } from "@/lib/data";
import { STATUS_LABELS } from "@/lib/reasons";
import { INSTALL_CMD, REPO_URL } from "@/lib/site";

export const revalidate = 60;

/** Short names for the findings summary (the full messages are on /check). */
const RULE_SHORT: Record<string, string> = {
  RL1: "pairing outside the official app",
  RL2: "talks you out of confirming",
  RL3: "uncapped approval, undeclared spender",
  RL5: "brand impersonation",
  RL6: "asks for wallet secrets",
  RL7: "promises returns",
  RL8: "no risk warning",
};

export default async function Home() {
  const index = await getIndex();
  const report = checkSkill(attackSampleFiles());
  const lines: TermLine[] = [{ text: `$ countersign check-install ./${ATTACK_SAMPLE_NAME}`, cls: "p" }];
  for (const r of report.results) {
    if (!r.findings.length) continue;
    const f = r.findings[0]!;
    const more = r.findings.length > 1 ? ` (+${r.findings.length - 1})` : "";
    lines.push({ text: `${r.passed ? "!" : "✗"} ${r.rule}  ${RULE_SHORT[r.rule] ?? r.title}  ${f.file}:${f.line}${more}`, cls: r.passed ? "warn" : "bad" });
  }
  lines.push({ text: "verdict: BLOCK · not installed", cls: "bad" });

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <HeroDuel>
            <h1>
              Bots can fake downloads. <span className="no">Not countersigns.</span>
            </h1>
            <p className="lede">A countersign needs a real Agent ID and its own on-chain session. Try to fake one.</p>
          </HeroDuel>
          <div className="hero-install">
            <CommandChip cmd={INSTALL_CMD} />
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2>How it can&apos;t be faked</h2>
          <Flow />
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="band-head">
            <h2>Try to fake one</h2>
            <span className="mono dim">every stamp is the real verifier&apos;s verdict</span>
          </div>
          <AttackLedger />
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <div>
            <h2>Blocked before you sign</h2>
            <p className="lede">A &quot;4,000+ downloads&quot; skill, caught before the wallet ever sees it.</p>
            <Link className="btn line" href="/check?sample=attack">
              Full report
            </Link>
          </div>
          <TypedTerminal label="check-install · summary" lines={lines} />
        </div>
      </section>

      <section className="band" id="live">
        <div className="wrap">
          <div className="band-head">
            <h2>Mainnet</h2>
            {index.deployed ? <Stamp kind="ok">Live</Stamp> : <Stamp kind="seal">Launching</Stamp>}
          </div>
          {index.deployed ? (
            <>
              <div className="ledger">
                <div className="ledger-row">
                  <span className="k">Verified countersigns</span>
                  <span className="leader" />
                  <span className="v big">{index.totals.counted}</span>
                </div>
                <div className="ledger-row">
                  <span className="k">Distinct Agent IDs</span>
                  <span className="leader" />
                  <span className="v big">{index.uniqueAgents.countersign}</span>
                </div>
                <div className="ledger-row">
                  <span className="k">Skill versions</span>
                  <span className="leader" />
                  <span className="v big">{index.totals.versions}</span>
                </div>
              </div>
              {index.versions.length ? (
                <div className="ledger versions">
                  {index.versions.map((v) => (
                    <Link key={v.versionId} href={`/s/${v.versionId}`} className="ledger-row">
                      <span className="k">{v.name}</span>
                      <span className="leader" />
                      <span className="why">{STATUS_LABELS[v.status] ?? v.status}</span>
                      <span className="v">
                        {v.counted} verified · {v.incidents} incidents
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="ledger">
              {[
                ["Contracts on BNB Smart Chain", "launching", "seal"],
                ["Verifier playground", "live", "ok"],
                ["Red-Line Check", "live", "ok"],
                ["countersign.json builder", "live", "ok"],
                ["Companion skill v1.0.0", "live", "ok"],
              ].map(([k, v, c]) => (
                <div key={k} className="ledger-row">
                  <span className="k">{k}</span>
                  <span className="leader" />
                  <span className={`v ${c}`}>{v}</span>
                </div>
              ))}
              <a className="ledger-row total" href={REPO_URL} rel="noreferrer">
                <span className="k">Source, tests, contracts</span>
                <span className="leader" />
                <span className="why">GitHub ↗</span>
              </a>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
