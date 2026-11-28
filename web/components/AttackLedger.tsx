"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadSim } from "@/lib/duel";
import { useLater } from "@/lib/motion";
import type { Outcome } from "@/lib/sim/scenarios";
import { OUTCOME_STAMP, Stamp } from "./Stamp";

export interface AttackRow {
  id: string;
  title: string;
  why: string;
}

interface Result {
  outcome: Outcome;
  line: string | null;
  n: number;
}

/** The landing tour asks the ledger to run every attack from a clean sheet (see HeroDuel). */
export const LEDGER_TOUR_EVENT = "countersign:ledger";

/**
 * Six attacks you can run right here. Each click runs the scenario through the real verifier and the
 * Countersign.sol mirror (the playground's code); the stamp and the deciding check come back from it.
 */
export function AttackLedger({ rows, total }: { rows: AttackRow[]; total: number }) {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const auto = useRef(false);
  const runs = useRef(0);
  const later = useLater();

  async function run(id: string, expand: boolean) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const sim = await loadSim();
      const r = await sim.scenarioById(id)!.run();
      const n = ++runs.current;
      setResults((prev) => ({ ...prev, [id]: { outcome: r.outcome, line: sim.decisiveLine(r), n } }));
      if (expand) setOpen(id);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  // Run the first attack by itself once the ledger is on screen, so the first stamp lands unprompted.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || auto.current) return;
        auto.current = true;
        io.disconnect();
        later.after(450, () => void run(rows[0]!.id, true));
      },
      { rootMargin: "0px 0px -35% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rows, later]);

  // The tour: a clean sheet, then all six in a row (and no separate auto-run of the first one).
  useEffect(() => {
    const replay = () => {
      auto.current = true;
      later.clear();
      setResults({});
      setOpen(null);
      rows.forEach((r, i) => later.after(i * 350, () => void run(r.id, false)));
    };
    window.addEventListener(LEDGER_TOUR_EVENT, replay);
    return () => window.removeEventListener(LEDGER_TOUR_EVENT, replay);
  }, [rows, later]);

  function runAll() {
    rows.forEach((r, i) => {
      if (!results[r.id]) later.after(i * 350, () => void run(r.id, false));
    });
  }

  const tried = rows.filter((r) => results[r.id]).length;
  const counted = rows.filter((r) => results[r.id]?.outcome === "counted").length;

  return (
    <div className="ledger attacks" ref={box}>
      {rows.map((row) => {
        const res = results[row.id];
        const st = res ? OUTCOME_STAMP[res.outcome] : null;
        const isOpen = open === row.id && Boolean(res);
        return (
          <div key={row.id} className={`attack${isOpen ? " open" : ""}`}>
            <button
              type="button"
              className="ledger-row"
              aria-expanded={isOpen}
              disabled={busy[row.id]}
              onClick={() => (res && open === row.id ? setOpen(null) : void run(row.id, true))}
            >
              <span className="k">{row.title}</span>
              <span className="leader" />
              {res ? <span className="why">{row.why}</span> : null}
              {st ? (
                <Stamp key={res!.n} kind={st.kind} className="slam">
                  {st.label}
                </Stamp>
              ) : (
                <span className="try">{busy[row.id] ? "running" : "try"}</span>
              )}
            </button>
            {isOpen ? (
              <div className="attack-detail" aria-live="polite">
                <span>
                  <b className={st!.kind === "warn" ? "warn" : "bad"}>{st!.kind === "warn" ? "!" : "✗"}</b> {res!.line ?? "counted"}
                </span>
                <Link href={`/try?s=${row.id}`}>full case →</Link>
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="ledger-row total">
        <span className="k">
          {failed ? "couldn't load the verifier" : `${tried}/${rows.length} tried · ${counted} counted`}
        </span>
        <span className="leader" />
        {tried < rows.length ? (
          <button type="button" className="link" onClick={runAll}>
            run all
          </button>
        ) : null}
        <Link className="why" href="/try">
          all {total} →
        </Link>
      </div>
    </div>
  );
}
