"use client";

import { useEffect, useRef, useState } from "react";
import type { ChainPulse } from "@/lib/chain";

const fmt = (n: string) => Number(n).toLocaleString("en-US");

/** "● live · BNB Smart Chain · block #N …", refreshed every 6 s while the tab is visible. */
export function LiveStrip({ initial }: { initial: ChainPulse | null }) {
  const [pulse, setPulse] = useState<ChainPulse | null>(initial);
  const [ok, setOk] = useState(Boolean(initial?.block));
  const [tick, setTick] = useState(0);
  const last = useRef(initial?.block ?? null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/v1/chain", { cache: "no-store" });
          const body = (await res.json()) as ChainPulse;
          if (!alive) return;
          setPulse(body);
          setOk(Boolean(body.block));
          if (body.block && body.block !== last.current) {
            last.current = body.block;
            setTick((t) => t + 1);
          }
        } catch {
          if (alive) setOk(false);
        }
      }
      if (alive) timer = setTimeout(run, 6000);
    };
    timer = setTimeout(run, 1200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const registry = pulse?.registry;
  return (
    <div className="live-strip" aria-live="polite">
      <span className="seg">
        <span className={`dot ${ok ? "live" : "wait"}`} />
        <b>{ok ? "live" : "reconnecting"}</b> BNB Smart Chain mainnet
      </span>
      <span className="seg">
        block{" "}
        <b key={tick} className={tick ? "ticked tabular" : "tabular"}>
          #{pulse?.block ? fmt(pulse.block) : "…"}
        </b>
      </span>
      {registry ? (
        <span className="seg">
          <a href={`https://bscscan.com/address/${registry.address}`} rel="noreferrer">
            Agent ID registry <b>{registry.name ?? "HandleRegistry"}</b> ✓
          </a>
        </span>
      ) : null}
      <span className="seg">
        COUNTERSIGN contracts{" "}
        {pulse?.deployed && pulse.contracts ? (
          <a href={`https://bscscan.com/address/${pulse.contracts.skillRegistry}#code`} rel="noreferrer">
            <b style={{ color: "var(--ok)" }}>live ✓</b>
          </a>
        ) : (
          <b style={{ color: "var(--seal)" }}>launching</b>
        )}
      </span>
    </div>
  );
}
