import type { RevertName } from "./sim/contract";
import type { Outcome } from "./sim/scenarios";

/**
 * The landing page's "bots vs real use" certificate. Downloads are made up (that's the point: anyone can
 * inflate them). Every countersign verdict comes from the real verifier and the Countersign.sol mirror,
 * running the playground's scenarios on a simulated chain.
 */

export type DuelEvent =
  | { kind: "bots"; count: number; error: RevertName | null }
  | { kind: "real"; outcome: Outcome; error: RevertName | null; checks: { id: string; ok: boolean }[] };

export interface DuelState {
  downloads: number;
  countersigns: number;
  signed: boolean;
  events: DuelEvent[];
}

export const INITIAL_DUEL: DuelState = { downloads: 4127, countersigns: 0, signed: false, events: [] };

type Scenarios = typeof import("./sim/scenarios");
const load = (): Promise<Scenarios> => import("./sim/scenarios");

/** 1,000 fresh wallets each try to countersign. The contract refuses every one (no Agent ID). */
export async function sendBots(s: DuelState, n = 1000, loader: () => Promise<Scenarios> = load): Promise<DuelState> {
  const { scenarioById } = await loader();
  const r = await scenarioById("bot-farm")!.run();
  return { ...s, downloads: s.downloads + n, events: [...s.events, { kind: "bots", count: n, error: r.revert?.error ?? null }] };
}

/** A real session and a countersign. Counts once; the same Agent ID trying again is refused. */
export async function useForReal(s: DuelState, loader: () => Promise<Scenarios> = load): Promise<DuelState> {
  const { scenarioById } = await loader();
  const r = await scenarioById(s.signed ? "twice" : "honest")!.run();
  const counted = r.outcome === "counted";
  const checks = r.steps.filter((st) => /^C[1-5]$/.test(st.id)).map((st) => ({ id: st.id, ok: st.state === "pass" }));
  return {
    ...s,
    downloads: s.downloads + 1,
    countersigns: s.countersigns + (counted ? 1 : 0),
    signed: s.signed || counted,
    events: [...s.events, { kind: "real", outcome: r.outcome, error: r.revert?.error ?? null, checks }],
  };
}
