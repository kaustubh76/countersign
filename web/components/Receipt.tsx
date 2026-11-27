import { InView } from "@/lib/motion";
import { pen } from "@/lib/penFont";
import type { ReceiptView } from "@/lib/sim/summary";
import { PenMark } from "./PenMark";
import { OUTCOME_STAMP, Stamp } from "./Stamp";

/**
 * What a countersign actually is, as a receipt from the simulated chain (the honest scenario, run on the
 * server), annotated in red pen. The marks draw in when it scrolls into view.
 */
export function Receipt({ r }: { r: ReceiptView }) {
  const st = OUTCOME_STAMP[r.outcome];
  const note = `rc-note pen-note ${pen.className}`;
  return (
    <InView className="receipt-wrap">
      <div className="paper receipt">
        <div className="rc-head">
          <span>Countersign · receipt</span>
          <span>simulated chain</span>
        </div>

        <div className="rc-row">
          <div className="rc-main">
            <span className="rk">skill</span>
            <span className="leader" />
            <span>dca-planner v1.2</span>
          </div>
        </div>
        <div className="rc-row">
          <div className="rc-main">
            <span className="rk">signer</span>
            <span className="leader" />
            <span className="marked">
              Agent ID {r.agentId}
              <PenMark kind="circle" className="rc-ring" delay={150} />
            </span>
          </div>
          <div className={note} style={{ ["--t" as string]: "350ms" }}>
            one per wallet
          </div>
        </div>

        <div className="rc-row rc-session">
          <div className="rc-main rc-txs">
            {r.txs.map((tx) => (
              <div key={tx.hash} className="rc-tx">
                <span className="hash">{tx.hash}</span>{" "}
                {tx.what.includes("→") ? (
                  tx.what
                ) : (
                  <>
                    {tx.what} →{" "}
                    <span className="marked">
                      {tx.to}
                      <PenMark kind="underline" className="rc-under" delay={1050} />
                    </span>
                  </>
                )}
              </div>
            ))}
            <PenMark kind="bracket" className="rc-bracket" delay={650} />
          </div>
          <div className="rc-notes">
            <div className={note} style={{ ["--t" as string]: "850ms" }}>
              its own txs, 48 h
            </div>
            <div className={note} style={{ ["--t" as string]: "1250ms" }}>
              the author&apos;s contract
            </div>
          </div>
        </div>

        <div className="rc-row">
          <div className="rc-main rc-checks">
            <span>{r.checks.every((c) => c.ok) ? "C1–C5 ✓" : r.checks.map((c) => `${c.id} ${c.ok ? "✓" : "✗"}`).join("  ")}</span>
            <Stamp kind={st.kind} big className="rc-stamp">
              {st.label}
            </Stamp>
          </div>
          <div className={note} style={{ ["--t" as string]: "1900ms" }}>
            anyone re-checks
          </div>
        </div>
      </div>
    </InView>
  );
}
