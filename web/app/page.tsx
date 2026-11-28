import Link from "next/link";
import { checkSkill } from "@countersign/redline";
import { AttackLedger } from "@/components/AttackLedger";
import { CommandChip } from "@/components/CodeBlock";
import { HeroDuel } from "@/components/HeroDuel";
import { PenMark } from "@/components/PenMark";
import { Receipt } from "@/components/Receipt";
import { RedactedPage } from "@/components/RedactedPage";
import { Stamp } from "@/components/Stamp";
import { ATTACK_SAMPLE_NAME, attackSampleFiles } from "@/lib/attackSample";
import { getIndex } from "@/lib/data";
import { redact } from "@/lib/redaction";
import { STATUS_LABELS } from "@/lib/reasons";
import { scenarioById, SCENARIOS } from "@/lib/sim/scenarios";
import { receiptFrom } from "@/lib/sim/summary";
import { INSTALL_CMD, REPO_URL, short } from "@/lib/site";
import { verdictOf } from "@/lib/verdict";

export const revalidate = 60;

/** The six attacks the landing page lets you run inline (all eleven are on /try). */
const LEDGER = ["bot-farm", "friend", "borrow", "shared-token", "self", "smear"];

export default async function Home() {
  const index = await getIndex();
  const honest = await scenarioById("honest")!.run();
  const sample = attackSampleFiles();
  const report = checkSkill(sample);
  const rows = LEDGER.map((id) => scenarioById(id)!).map((s) => ({ id: s.id, title: s.title, why: s.why }));
  const fakes = SCENARIOS.filter((s) => s.group === "fake").length;

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <HeroDuel
            title={
              <h1>
                Bots can fake{" "}
                <span className="h-word">
                  downloads.
                  <PenMark kind="strike" className="h-mark h-strike" />
                </span>{" "}
                <span className="no">
                  Not{" "}
                  <span className="h-word">
                    countersigns.
                    <PenMark kind="check" className="h-mark h-check" />
                  </span>
                </span>
              </h1>
            }
            lede={<p className="lede">A countersign needs a real Agent ID and its own on-chain session. Try to fake one.</p>}
            versionLabel={short(honest.report.versionId)}
          />
        </div>
      </section>

      <section className="band" id="attacks">
        <div className="wrap">
          <h2>Try to fake one</h2>
          <AttackLedger rows={rows} total={fakes} />
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <h2>How it can&apos;t be faked</h2>
          <Receipt r={receiptFrom(honest)} />
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
          <RedactedPage files={redact(sample, report)} name={ATTACK_SAMPLE_NAME} verdict={verdictOf(report)} />
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
                  <span className="v big">{index.uniqueAgents.union}</span>
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
                ["Playground, Red-Line Check, builder", "live", "ok"],
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

      <section className="band closing" id="your-move">
        <div className="wrap closing-row">
          <h2>Your move.</h2>
          <div className="closing-act">
            <div className="hero-actions">
              <Link className="btn seal" href="/try">
                Try all 11 attacks
              </Link>
              <Link className="btn line" href="/check">
                Check a skill
              </Link>
            </div>
            <CommandChip cmd={INSTALL_CMD} />
          </div>
        </div>
      </section>
    </>
  );
}
