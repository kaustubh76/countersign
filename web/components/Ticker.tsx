"use client";

import { useEffect, useRef, useState } from "react";
import type { ChainPulse } from "@/lib/chain";

/** The strip above the nav: live BNB Smart Chain block, the Agent ID registry, and mainnet status. */
export function Ticker() {
  const [pulse, setPulse] = useState<ChainPulse | null>(null);
  const [ok, setOk] = useState(true);
  const [tick, setTick] = useState(0);
  const last = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (document.visibilityState === "visible") {
        try {
          const body = (await (await fetch("/api/v1/chain", { cache: "no-store" })).json()) as ChainPulse;
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
    void run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="ticker" aria-live="off">
      <div className="wrap">
        <span className="t-seg">
          <span className={`dot ${ok ? "live" : "wait"}`} /> {ok ? "Live" : "Reconnecting"}
        </span>
        <span className="t-seg">
          <span className="hide-sm">BNB Smart Chain</span>
          <b key={tick} className={tick > 1 ? "ticked" : undefined}>
            #{pulse?.block ? Number(pulse.block).toLocaleString("en-US") : "…"}
          </b>
        </span>
        <span className="t-seg hide-sm">
          Agent ID registry <b>{pulse?.registry.name ? "✓" : "…"}</b>
        </span>
        <span className="t-seg">
          Mainnet{" "}
          {pulse?.deployed ? <b className="ok">live</b> : <b className="seal">launching</b>}
        </span>
      </div>
    </div>
  );
}
