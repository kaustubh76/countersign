import Link from "next/link";
import { SCENARIOS } from "@/lib/sim/scenarios";
import { OUTCOME_STAMP, Stamp } from "./Stamp";

const PICK = ["bot-farm", "friend", "borrow", "shared-token", "self", "smear"];

/** Six attacks as ledger rows, each stamped with what the real verifier decides (pinned by tests). */
export function AttackLedger() {
  const rows = PICK.map((id) => SCENARIOS.find((s) => s.id === id)!).filter(Boolean);
  const fakes = SCENARIOS.filter((s) => s.group === "fake").length;
  return (
    <div className="ledger attacks">
      {rows.map((s) => {
        const st = OUTCOME_STAMP[s.expected];
        return (
          <Link key={s.id} href={`/try?s=${s.id}`} className="ledger-row">
            <span className="k">{s.title}</span>
            <span className="leader" />
            <span className="why">{s.why}</span>
            <Stamp kind={st.kind}>{st.label}</Stamp>
          </Link>
        );
      })}
      <Link href="/try" className="ledger-row total">
        <span className="k">
          {fakes} attacks · 0 counted
        </span>
        <span className="leader" />
        <span className="why">play them all →</span>
      </Link>
    </div>
  );
}
