import type { RevertName } from "./sim/contract";
import type { Outcome } from "./sim/scenarios";

/**
 * The landing page's "bots vs real use" certificate. Downloads are made up (that's the point: anyone can
 * inflate them). Every countersign verdict comes from the real verifier and the Countersign.sol mirror,
 * running the playground's scenarios on a simulated chain.
 */

export type DuelEvent =
  | { kind: "bots"; count: number; error: RevertName | null }
  | { kind: "ink"; error: RevertName | null }
  | {
      kind: "real";
      outcome: Outcome;
      error: RevertName | null;
      checks: { id: string; ok: boolean }[];
      txs: { what: string; when: string }[];
    };

export interface DuelState {
  downloads: number;
  countersigns: number;
  /** Countersign attempts the contract refused (bots, hand-drawn ink, repeats). */
  refused: number;
  signed: boolean;
  events: DuelEvent[];
}

export const INITIAL_DUEL: DuelState = { downloads: 4127, countersigns: 0, refused: 0, signed: false, events: [] };

async function importSim() {
  const [scenarios, summary] = await Promise.all([import("./sim/scenarios"), import("./sim/summary")]);
  return {
    scenarioById: scenarios.scenarioById,
    txLines: summary.txLines,
    checkFlags: summary.checkFlags,
    decisiveLine: summary.decisiveLine,
  };
}
export type Sim = Awaited<ReturnType<typeof importSim>>;

let simChunk: Promise<Sim> | null = null;
/** The simulator (viem + verifier) is its own chunk: loaded on idle or on first use, then cached. */
export function loadSim(): Promise<Sim> {
  if (!simChunk)
    simChunk = importSim().catch((e: unknown) => {
      simChunk = null;
      throw e;
    });
  return simChunk;
}

async function run(id: string, loader: () => Promise<Sim>) {
  const sim = await loader();
  const scenario = sim.scenarioById(id);
  if (!scenario) throw new Error(`unknown scenario ${id}`);
  return { sim, r: await scenario.run() };
}

/** Attract mode: made-up bot downloads. Only the download count moves. */
export const botTraffic = (s: DuelState, n: number): DuelState => ({ ...s, downloads: s.downloads + n });

/** 1,000 fresh wallets each try to countersign. The contract refuses every one (no Agent ID). */
export async function sendBots(s: DuelState, n = 1000, loader = loadSim): Promise<DuelState> {
  const { r } = await run("bot-farm", loader);
  return {
    ...s,
    downloads: s.downloads + n,
    countersigns: s.countersigns + (r.outcome === "counted" ? n : 0),
    refused: s.refused + (r.outcome === "reverted" ? n : 0),
    events: [...s.events, { kind: "bots", count: n, error: r.revert?.error ?? null }],
  };
}

/** A signature drawn by hand: ink with no Agent ID behind it. Same contract call, same refusal. */
export async function signWithInk(s: DuelState, loader = loadSim): Promise<DuelState> {
  const { r } = await run("bot-farm", loader);
  return {
    ...s,
    countersigns: s.countersigns + (r.outcome === "counted" ? 1 : 0),
    refused: s.refused + (r.outcome === "reverted" ? 1 : 0),
    events: [...s.events, { kind: "ink", error: r.revert?.error ?? null }],
  };
}

/** A real session and a countersign. Counts once; the same Agent ID trying again is refused. */
export async function useForReal(s: DuelState, loader = loadSim): Promise<DuelState> {
  const { sim, r } = await run(s.signed ? "twice" : "honest", loader);
  const counted = r.outcome === "counted";
  return {
    ...s,
    downloads: s.downloads + 1,
    countersigns: s.countersigns + (counted ? 1 : 0),
    refused: s.refused + (r.outcome === "reverted" ? 1 : 0),
    signed: s.signed || counted,
    events: [...s.events, { kind: "real", outcome: r.outcome, error: r.revert?.error ?? null, checks: sim.checkFlags(r), txs: counted ? sim.txLines(r) : [] }],
  };
}

export interface SwarmBit {
  /** Position inside the swarm layer, in percent. */
  x: number;
  y: number;
  rot: number;
  /** Start delay in ms. */
  delay: number;
  /** A short wallet stub, e.g. "0x3fa2". */
  stub: string;
}

/** Seeded layout for the bot swarm, so a given click always looks the same (and tests can pin it). */
export function swarmLayout(n: number, seed: number, spreadMs = 1150): SwarmBit[] {
  let t = seed >>> 0 || 1;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round((2 + rnd() * 70) * 10) / 10,
    y: Math.round((4 + rnd() * 72) * 10) / 10,
    rot: Math.round(-16 + rnd() * 32),
    delay: Math.round((i / Math.max(1, n)) * spreadMs + rnd() * 90),
    stub: `0x${Math.floor(rnd() * 0x10000)
      .toString(16)
      .padStart(4, "0")}`,
  }));
}

const n = (x: number) => x.toLocaleString("en-US");

/**
 * The text for sharing the visitor's own run of the demo. Always says it's a demo: the downloads are made
 * up and the chain is simulated, so it never claims anything happened on-chain.
 */
export function shareText(s: DuelState): string {
  const bots = s.events.reduce((sum, e) => sum + (e.kind === "bots" ? e.count : 0), 0);
  const inked = s.events.some((e) => e.kind === "ink");
  const parts: string[] = [];
  if (bots) parts.push(`I sent ${n(bots)} bots at a skill certificate. Downloads: ${n(s.downloads)}. Countersigns: ${s.signed ? 0 : s.countersigns}.`);
  if (inked) parts.push("I forged the signature by hand too: void.");
  if (s.signed) parts.push(`Then I used it for real: ${s.countersigns} countersign.`);
  if (!parts.length) parts.push("Bots can fake downloads. Not countersigns.");
  return `Demo: ${parts.join(" ")}`;
}
