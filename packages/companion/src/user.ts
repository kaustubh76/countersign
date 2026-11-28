import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { decodeFunctionData, encodeFunctionData, getAddress, isAddressEqual, zeroAddress, type Address, type Hex } from "viem";
import {
  computeVersionId,
  countersignAbi,
  FLAG_ANCHOR,
  encodeCountersign,
  encodeReport,
  evaluateRecord,
  HARMFUL_REDLINE_RULES,
  KIND_COUNTERSIGN,
  KIND_REPORT,
  LIMITS,
  MAX_UINT256,
  readAgentId,
  readRecords,
  readVersion,
  readVersionsByContent,
  summarizeAttestations,
  type ParsedManifest,
  type RecordView,
  type VersionView,
} from "@countersign/core";
import { bool, flag, list, type Args } from "./args.js";
import { addressArg, bawPreview, loadContext, loadContextOrNull, UsageError, type Context } from "./context.js";
import { withOwnerPowers } from "./ownerPowers.js";
import { verdictOf, type Reason, type Result } from "./output.js";
import { loadSkill, type LoadedSkill } from "./skill.js";
import { versionStatus } from "./trust.js";

const LINKAGE_NOTICE =
  "This transaction is public: it permanently links this wallet (and its Agent ID) to this skill version on BNB Smart Chain. COUNTERSIGN's site and API show counts only, never who, but anyone can read the chain.";

/** Rules whose failure means the skill tries to harm the user (block). The rest only warn. */
const HARMFUL_RULES = new Set(HARMFUL_REDLINE_RULES);

const TOKEN_ABI = [
  { type: "function", name: "approve", inputs: [{ type: "address", name: "spender" }, { type: "uint256", name: "amount" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "increaseAllowance", inputs: [{ type: "address", name: "spender" }, { type: "uint256", name: "added" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "transfer", inputs: [{ type: "address", name: "to" }, { type: "uint256", name: "amount" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "transferFrom", inputs: [{ type: "address", name: "from" }, { type: "address", name: "to" }, { type: "uint256", name: "amount" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "setApprovalForAll", inputs: [{ type: "address", name: "operator" }, { type: "bool", name: "approved" }], outputs: [], stateMutability: "nonpayable" },
] as const;

function label(m: ParsedManifest | null, a: Address): string {
  const l = m?.labels[a.toLowerCase()];
  return l ? `${l} (${a})` : a;
}

function skillArg(args: Args): string {
  const dir = flag(args, "skill") ?? args.positionals[1];
  if (!dir) throw new UsageError("missing <skill-dir> (or --skill <dir>)");
  return dir;
}

async function versionOf(ctx: Context, skill: LoadedSkill): Promise<{ versionId: Hex | null; registered: VersionView | null; publisherHasAgentId: boolean }> {
  if (!skill.manifest) return { versionId: null, registered: null, publisherHasAgentId: false };
  const agent = await readAgentId(ctx.reader, ctx.deployment.agentId, skill.manifest.publisher);
  if (!agent) return { versionId: null, registered: null, publisherHasAgentId: false };
  const versionId = computeVersionId(skill.content.contentHash, skill.manifest.manifestHash, agent.agentId);
  return { versionId, registered: await readVersion(ctx.reader, ctx.deployment, versionId), publisherHasAgentId: true };
}

// ── check-install ──────────────────────────────────────────────────────────────────────────────

/** Said with every warn or block (§9, red line 8): COUNTERSIGN checks declarations, not trades. */
export const RISK_NOTICE =
  "Trading through any skill carries risk of loss. COUNTERSIGN checks what a skill declared and what its users' wallets did, not whether a trade is wise. This is not financial advice.";

/** The human signal, always part of pre-flight (§5.3): verified countersigns and verified incidents. */
export interface HumanSignal {
  registered: boolean;
  attested: boolean;
  guarded: number;
  counted: number;
  established: number | null;
  incidents: number;
}

export function signalLine(s: HumanSignal): string {
  const parts = [s.registered ? "Registered ✓" : "Not registered"];
  if (s.attested) parts.push("Red-line attested ✓");
  if (s.guarded) parts.push("Guarded ✓");
  parts.push(`Countersigned by ${s.counted}${s.established ? ` (${s.established} established)` : ""}`);
  parts.push(`${s.incidents} verified incident${s.incidents === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function withRiskNotice(result: Result): Result {
  if (result.verdict !== "warn" && result.verdict !== "block") return result;
  return { ...result, reasons: [...(result.reasons ?? []), { level: "info", text: RISK_NOTICE }], data: { ...result.data, riskNotice: RISK_NOTICE } };
}

/** countersign check-install <skill-dir> [--verify-local] [--offline]: should the agent trust this skill version? */
export async function cmdCheckInstall(args: Args): Promise<Result> {
  const ctx = await loadContextOrNull(args);
  const chainId = ctx?.chainId ?? Number(flag(args, "chain") ?? process.env.COUNTERSIGN_CHAIN_ID ?? 56);
  const extraKnown = ctx ? [ctx.deployment.skillRegistry, ctx.deployment.countersign, ...(ctx.deployment.guardedExecutor ? [ctx.deployment.guardedExecutor] : [])] : [];
  const skill = await withOwnerPowers(await loadSkill(skillArg(args), { extraKnown }), args, { ...(ctx ? { reader: ctx.reader } : {}), chainId, extraKnown });
  const reasons: Reason[] = [];
  const m = skill.manifest;
  const signal: HumanSignal = { registered: false, attested: false, guarded: 0, counted: 0, established: null, incidents: 0 };

  // 1. the Red-Line Check on the files the agent is about to run
  for (const r of skill.redline.results) {
    for (const f of r.findings) {
      const level = f.severity === "warn" ? "warn" : HARMFUL_RULES.has(r.rule) ? "block" : "warn";
      reasons.push({ level, text: `${r.rule}: ${f.message} (${f.file}:${f.line}: "${f.snippet.slice(0, 80)}")` });
    }
  }
  if (!skill.redline.results.some((r) => r.findings.some((f) => f.severity === "fail"))) {
    reasons.push({ level: "ok", text: "Red-Line Check: no failing rule" });
  }
  for (const n of skill.redline.notes) if (n.startsWith("RL4")) reasons.push({ level: "info", text: n });

  // 2. manifest, registration, attestation and the human signal
  if (!m) {
    reasons.push({ level: "warn", text: `${skill.manifestProblem ?? "no countersign.json"}: COUNTERSIGN cannot check this skill's wallet calls, and nobody can countersign it` });
  }
  if (!ctx) {
    reasons.push({ level: "warn", text: `COUNTERSIGN is not deployed on chain ${chainId} yet: only the Red-Line Check ran, and nobody can have countersigned this skill` });
  } else if (m) {
    const { versionId, registered, publisherHasAgentId } = await versionOf(ctx, skill);
    if (!publisherHasAgentId) reasons.push({ level: "warn", text: `publisher ${m.publisher} holds no Agent ID, so this version cannot be registered or countersigned` });
    if (versionId && !registered) {
      reasons.push({ level: "warn", text: "this exact version is not registered: nobody has countersigned it yet" });
      const others = await readVersionsByContent(ctx.reader, ctx.deployment, skill.content.contentHash);
      if (others.length) reasons.push({ level: "info", text: `${others.length} non-canonical registration(s) of these files exist (not by the publisher); ignored` });
    }
    if (registered && versionId) {
      signal.registered = true;
      reasons.push({ level: "ok", text: `registered by the publisher's Agent ID (block ${registered.registeredBlock})` });
      const { report, source } = await versionStatus(ctx, versionId, { local: bool(args, "verify-local"), noContent: bool(args, "no-content") });
      const att = report?.attestation ?? summarizeAttestations(registered.attestations);
      signal.attested = att.status === "passed";
      if (att.status === "passed") {
        reasons.push({
          level: "ok",
          text: `Red-Line attested by ${att.passing} attester${att.passing === 1 ? "" : "s"}: every rule it checked passed${att.ownerPowersChecked ? ", including owner powers (RL4)" : "; owner powers (RL4) were not checked"}`,
        });
      } else if (att.status === "failed") {
        reasons.push({ level: "warn", text: "a Red-Line attester recorded failed rules for this version" });
      } else {
        reasons.push({ level: "warn", text: "no Red-Line attestation" });
      }
      signal.guarded = registered.targets.filter((t) => (t.flags & FLAG_ANCHOR) !== 0 && t.endorser !== zeroAddress && t.guarded === true).length;
      if (signal.guarded) {
        reasons.push({ level: "ok", text: "the author's contract accepts calls through COUNTERSIGN's GuardedExecutor: routed calls revert on-chain outside the manifest (use check-call --guarded)" });
      }
      if (report) {
        signal.counted = report.countersigns.counted;
        signal.established = report.countersigns.established;
        signal.incidents = report.incidents.length;
        for (const inc of report.incidents) reasons.push({ level: "block", text: `verified incident (${inc.kind}): ${inc.detail}${inc.txHash ? ` (${inc.txHash})` : ""}` });
        const n = report.countersigns.counted;
        reasons.push({
          level: n > 0 ? "ok" : "warn",
          text: `countersigned by ${n} Agent ID holder${n === 1 ? "" : "s"} whose own on-chain sessions were verified${report.countersigns.established ? ` (${report.countersigns.established} also used other authors' skills)` : ""} (${source === "api" ? "via the COUNTERSIGN API" : "verified locally from chain data"})`,
        });
        if (report.countersigns.peer) reasons.push({ level: "info", text: `${report.countersigns.peer} more from reciprocal author pairs (not counted)` });
        if (report.anchors.endorsed === 0) reasons.push({ level: "warn", text: "no endorsed anchor: no countersign can count yet" });
        if (report.claims.total) {
          reasons.push({
            level: report.claims.corroborated ? "warn" : "info",
            text: `${report.claims.total} unverified report(s)${report.claims.corroborated ? ", corroborated by 3+ independent users" : ""}`,
          });
        }
        if (report.canonical === "mismatch") reasons.push({ level: "warn", text: `published content check failed: ${report.canonicalDetail.join("; ")}` });
      }
    }
    return withRiskNotice(installResult(reasons, signal, { versionId, contentHash: skill.content.contentHash, manifestHash: m.manifestHash }));
  }
  return withRiskNotice(installResult(reasons, signal, { versionId: null, contentHash: skill.content.contentHash, manifestHash: m?.manifestHash ?? null }));
}

function installResult(reasons: Reason[], signal: HumanSignal, ids: Record<string, unknown>): Result {
  const verdict = verdictOf(reasons);
  const line = signalLine(signal);
  const blocks = reasons.filter((r) => r.level === "block").map((r) => r.text.split(" (")[0]);
  return {
    ok: true,
    command: "check-install",
    verdict,
    say: verdict === "block" ? `Blocked: ${blocks.slice(0, 3).join("; ")}. (${line})` : verdict === "warn" ? `Use with caution (${line}).` : `${line}.`,
    reasons,
    data: { ...ids, signal },
  };
}

// ── check-call ─────────────────────────────────────────────────────────────────────────────────

type TokenCall = { functionName: string; args?: readonly unknown[] };

function decodeTokenCall(data: Hex): TokenCall | null {
  try {
    return decodeFunctionData({ abi: TOKEN_ABI, data });
  } catch {
    return null;
  }
}

/**
 * A call from a skill that declares nothing (no countersign.json). Nothing can be in-manifest, but some calls
 * are never safe to preview: an approval for the maximum amount, or an operator approval over a whole
 * collection (§13: the demo's bundled approval). Everything else warns.
 */
export function checkCallWithoutManifest(to: Address, data: Hex, value: bigint): Reason[] {
  const reasons: Reason[] = [{ level: "warn", text: "this skill declares no permissions (no countersign.json), so the call cannot be checked against them" }];
  const d = decodeTokenCall(data);
  const [a0, a1] = d?.args ?? [];
  if (d && (d.functionName === "approve" || d.functionName === "increaseAllowance")) {
    const spender = getAddress(a0 as string);
    if ((a1 as bigint) === MAX_UINT256) reasons.push({ level: "block", text: `approval for the maximum amount to ${spender}` });
    reasons.push({ level: "warn", text: `approval to ${spender}, a spender the skill never declared` });
  } else if (d && d.functionName === "setApprovalForAll" && a1 === true) {
    reasons.push({ level: "block", text: `operator approval over every token of ${to} to ${getAddress(a0 as string)}, which the skill never declared` });
  } else if (d && (d.functionName === "transfer" || d.functionName === "transferFrom")) {
    reasons.push({ level: "warn", text: "token transfer to a recipient the skill never declared" });
  }
  if (value > 0n) reasons.push({ level: "warn", text: `sends ${value} wei of native value` });
  return reasons;
}

export function checkCallAgainstManifest(
  m: ParsedManifest,
  to: Address,
  data: Hex,
  value: bigint,
  wallet: Address | null,
): Reason[] {
  const reasons: Reason[] = [];
  const targets = m.onchain.targets;
  const index = targets.findIndex((t) => isAddressEqual(t.target, to));
  if (index === -1) {
    reasons.push({ level: "block", text: `target ${to} is not declared in countersign.json` });
    return reasons;
  }
  const target = targets[index]!;
  reasons.push({ level: "ok", text: `target ${label(m, to)} is declared` });
  const selector = (data.length >= 10 ? data.slice(0, 10) : "0x00000000").toLowerCase();
  if (!m.onchain.permissions.some((p) => p.targetIndex === index && p.selector.toLowerCase() === selector)) {
    reasons.push({ level: "block", text: `function ${selector} is not declared for this target` });
  } else {
    reasons.push({ level: "ok", text: `function ${selector} is declared` });
  }
  if (value > target.maxValue) reasons.push({ level: "block", text: `sends ${value} wei, above the declared cap of ${target.maxValue}` });

  const decoded = decodeTokenCall(data);
  if (decoded) {
    const flowFor = (kind: number, counterparty: Address) =>
      m.onchain.flows.find((f) => f.kind === kind && isAddressEqual(f.token, to) && isAddressEqual(f.counterparty, counterparty));
    const [a0, a1, a2] = decoded.args ?? [];
    if (decoded.functionName === "approve" || decoded.functionName === "increaseAllowance") {
      const spender = getAddress(a0 as string);
      const amount = a1 as bigint;
      const flow = flowFor(0, spender);
      if (amount === MAX_UINT256) reasons.push({ level: "block", text: `approval for the maximum amount to ${spender}` });
      if (!flow) reasons.push({ level: "block", text: `approval to undeclared spender ${spender}` });
      else if (amount > flow.cap) reasons.push({ level: "block", text: `approval of ${amount} exceeds the declared cap ${flow.cap}` });
      else reasons.push({ level: "ok", text: `approval to ${label(m, spender)} within the declared cap` });
    } else if (decoded.functionName === "transfer" || (decoded.functionName === "transferFrom" && wallet && isAddressEqual(getAddress(a0 as string), wallet))) {
      const recipient = getAddress((decoded.functionName === "transfer" ? a0 : a1) as string);
      const amount = (decoded.functionName === "transfer" ? a1 : a2) as bigint;
      const flow = flowFor(1, recipient);
      if (!flow) reasons.push({ level: "block", text: `token transfer to undeclared recipient ${recipient}` });
      else if (amount > flow.cap) reasons.push({ level: "block", text: `transfer of ${amount} exceeds the declared cap ${flow.cap}` });
      else reasons.push({ level: "ok", text: `transfer to ${label(m, recipient)} within the declared cap` });
    } else if (decoded.functionName === "setApprovalForAll" && a1 === true) {
      const operator = getAddress(a0 as string);
      if (!flowFor(0, operator)) reasons.push({ level: "block", text: `operator approval to undeclared ${operator}` });
    }
  }
  return reasons;
}

const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }, { type: "address" }, { type: "bytes" }],
    outputs: [{ type: "bytes" }],
  },
] as const;
const FORWARDER_ABI = [{ type: "function", name: "isTrustedForwarder", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] }] as const;
const TOKEN_SELECTORS = new Set(["0x095ea7b3", "0x39509351", "0xa9059cbb", "0x23b872dd", "0xa22cb465", "0xd505accf"]);

/**
 * countersign check-call --skill <dir> --to <addr> --data <hex> [--value <wei>] [--from <wallet>] [--guarded]
 * Before every preview: is the call inside what the skill declared? With --guarded (and an author contract
 * that accepts it), the preview is routed through the GuardedExecutor, so the chain itself refuses anything
 * outside the manifest. A call already addressed to the executor is checked as the call it carries.
 */
export async function cmdCheckCall(args: Args): Promise<Result> {
  const skill = await loadSkill(skillArg(args));
  let to = addressArg(flag(args, "to"), "--to");
  let data = (flag(args, "data") ?? "0x") as Hex;
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new UsageError("--data must be hex");
  const value = BigInt(flag(args, "value") ?? "0");
  const wallet = flag(args, "from") ? addressArg(flag(args, "from"), "--from") : null;
  const ctx = await loadContextOrNull(args);
  const executor = ctx?.deployment.guardedExecutor;
  const pre: Reason[] = [];
  let routedVersion: Hex | null = null;
  if (executor && isAddressEqual(to, executor)) {
    try {
      const { args: x } = decodeFunctionData({ abi: EXECUTE_ABI, data });
      routedVersion = x[0];
      to = getAddress(x[1]);
      data = x[2];
      pre.push({ level: "info", text: `addressed to the GuardedExecutor: checking the call it carries, to ${to}` });
    } catch {
      return withRiskNotice({ ok: true, command: "check-call", verdict: "block", say: "Blocked: a malformed GuardedExecutor call.", reasons: [{ level: "block", text: "not an execute(bytes32,address,bytes) call" }] });
    }
  }

  if (!skill.manifest) {
    const reasons = [...pre, ...checkCallWithoutManifest(to, data, value)];
    const verdict = verdictOf(reasons);
    return withRiskNotice({
      ok: true,
      command: "check-call",
      verdict,
      say:
        verdict === "block"
          ? `Blocked: ${reasons.filter((r) => r.level === "block").map((r) => r.text).join("; ")}. Do not preview or execute it; tell the user.`
          : "This skill declares no permissions, so COUNTERSIGN cannot check this call. Show the user the full preview before confirming.",
      reasons,
    });
  }

  const reasons = [...pre, ...checkCallAgainstManifest(skill.manifest, to, data, value, wallet)];
  const chainId = Number(flag(args, "chain") ?? skill.manifest.chainId);
  const next: NonNullable<Result["next"]> = [];
  let guardedRoute = false;
  if (ctx && (bool(args, "guarded") || routedVersion) && executor && verdictOf(reasons) !== "block") {
    const { versionId } = await versionOf(ctx, skill);
    if (routedVersion && versionId && routedVersion.toLowerCase() !== versionId.toLowerCase()) {
      reasons.push({ level: "block", text: "the guarded call names a different skill version than this one" });
    } else if (versionId) {
      const trusted = await ctx.reader.client.readContract({ address: to, abi: FORWARDER_ABI, functionName: "isTrustedForwarder", args: [executor] }).catch(() => false);
      const selector = data.slice(0, 10).toLowerCase();
      if (!trusted) reasons.push({ level: "info", text: "this contract does not accept the GuardedExecutor: preview the call directly" });
      else if (value > 0n || TOKEN_SELECTORS.has(selector)) reasons.push({ level: "info", text: "the GuardedExecutor forwards no value and no token movements: preview this call directly" });
      else {
        guardedRoute = true;
        reasons.push({ level: "ok", text: "routed through the GuardedExecutor: the chain refuses it if it leaves the manifest" });
        if (wallet) next.push({ what: "Preview (sends nothing), routed through the GuardedExecutor:", run: bawPreview(chainId, wallet, executor, encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [versionId, to, data] }), 0n) });
      }
    }
  }
  const verdict = verdictOf(reasons);
  if (verdict !== "block" && wallet && !guardedRoute) next.push({ what: "Preview (sends nothing):", run: bawPreview(chainId, wallet, to, data, value) });
  if (verdict !== "block" && wallet) next.push({ what: `Then check Binance's simulation: countersign check-preview --skill ${skill.dir} --preview <preview JSON>` });
  return withRiskNotice({
    ok: true,
    command: "check-call",
    verdict,
    say:
      verdict === "block"
        ? `Blocked: this call is outside what the skill declared (${reasons.filter((r) => r.level === "block").map((r) => r.text).join("; ")}). Do not preview or execute it; tell the user.`
        : "Inside the skill's declared permissions. Preview it, show the user the result, and wait for an explicit yes.",
    reasons,
    next,
  });
}

// ── check-preview ──────────────────────────────────────────────────────────────────────────────

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

async function readPreviewArg(args: Args): Promise<unknown> {
  const p = flag(args, "preview");
  if (!p) throw new UsageError("missing --preview <file | - | JSON>");
  const text = p.trim().startsWith("{") ? p : p === "-" ? await new Promise<string>((res) => {
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => res(s));
  }) : await readFile(p, "utf8");
  return JSON.parse(text);
}

/** countersign check-preview --skill <dir> --preview <file|-|json>: compare Binance's simulation to the manifest. */
export async function cmdCheckPreview(args: Args): Promise<Result> {
  const skill = await loadSkill(skillArg(args));
  const raw = (await readPreviewArg(args)) as Record<string, unknown>;
  if (raw.success === false) {
    const err = (raw.error ?? {}) as Record<string, unknown>;
    return withRiskNotice({
      ok: true,
      command: "check-preview",
      verdict: "block",
      say: `The wallet refused to preview this call (${String(err.code ?? "")} ${String(err.name ?? err.message ?? "")}). Do not execute; tell the user.`,
      reasons: [{ level: "block", text: String(err.message ?? "preview failed") }],
    });
  }
  const data = ((raw.data ?? raw) as Record<string, unknown>) ?? {};
  const sim = (data.simulationResult ?? {}) as Record<string, unknown>;
  const m = skill.manifest;
  const reasons: Reason[] = [];

  const allowances = Array.isArray(sim.allowanceChanges) ? (sim.allowanceChanges as Record<string, unknown>[]) : null;
  if (allowances === null) reasons.push({ level: "warn", text: "the preview did not include allowance changes; review the approvals by hand" });
  for (const a of allowances ?? []) {
    const spender = pick(a, ["spender", "spenderAddress", "approveTo", "approvedAddress", "operator", "to"]);
    const token = pick(a, ["token", "tokenAddress", "contractAddress", "asset", "address"]);
    const amount = pick(a, ["amount", "value", "allowance", "newAllowance", "rawAmount", "approveAmount"]);
    const unlimited = pick(a, ["isUnlimited", "isMax", "unlimited", "isInfinite"]) === true;
    if (typeof spender !== "string" || typeof token !== "string") {
      reasons.push({ level: "warn", text: `allowance change in an unrecognised format: ${JSON.stringify(a).slice(0, 160)}` });
      continue;
    }
    if (unlimited) reasons.push({ level: "block", text: `simulation shows an approval with no cap to ${spender}` });
    const flow = m?.onchain.flows.find((f) => f.kind === 0 && isAddressEqual(f.token, token as Address) && isAddressEqual(f.counterparty, spender as Address));
    if (!flow) reasons.push({ level: "block", text: `simulation shows an approval to ${spender}, which the skill did not declare` });
    else if (typeof amount === "string" && /^[0-9]+$/.test(amount) && BigInt(amount) > flow.cap) {
      reasons.push({ level: "block", text: `simulated approval ${amount} exceeds the declared cap ${flow.cap}` });
    } else reasons.push({ level: "ok", text: `approval to ${label(m, spender as Address)} is declared` });
  }
  const authority = Array.isArray(sim.authorityChanges) ? (sim.authorityChanges as unknown[]) : [];
  if (authority.length) reasons.push({ level: "block", text: `simulation shows ${authority.length} authority/permission change(s) on the wallet` });
  const balances = Array.isArray(sim.balanceChanges) ? (sim.balanceChanges as Record<string, unknown>[]) : [];
  for (const b of balances) {
    const amount = String(pick(b, ["amount", "change", "value", "delta"]) ?? "");
    const symbol = String(pick(b, ["symbol", "tokenSymbol", "token"]) ?? "");
    if (amount) reasons.push({ level: "info", text: `balance change: ${amount} ${symbol}` });
  }
  const risks = ((data.risks as Record<string, unknown>)?.riskDetails ?? []) as Record<string, unknown>[];
  for (const r of Array.isArray(risks) ? risks : []) {
    reasons.push({ level: "warn", text: `Binance risk check: ${String(r.title ?? r.code ?? "risk")}${r.description ? `: ${String(r.description)}` : ""}` });
  }
  const simCode = sim.simulationCode;
  if (simCode !== undefined && simCode !== 0 && simCode !== "0" && simCode !== "SUCCESS") {
    reasons.push({ level: "warn", text: `simulation reported code ${String(simCode)}${sim.simulationErrorDetail ? `: ${String(sim.simulationErrorDetail)}` : ""}` });
  }
  if (data.requireConfirmation === true) reasons.push({ level: "info", text: "the Binance App will also ask for confirmation" });
  if (!m) reasons.push({ level: "warn", text: "the skill declares no permissions; nothing to compare against" });

  const verdict = verdictOf(reasons);
  const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
  return withRiskNotice({
    ok: true,
    command: "check-preview",
    verdict,
    say:
      verdict === "block"
        ? "Blocked: Binance's simulation shows effects outside what the skill declared. Do not execute; show the user these reasons."
        : "The simulated effects match the skill's declaration. Show the user the preview and execute only after an explicit yes.",
    reasons,
    next:
      verdict === "block" || !requestId
        ? []
        : [
            { what: "Only after the user explicitly says yes:", run: `baw contract-call execute --requestId ${requestId} --json` },
            { what: "Then record the tx in the session:", run: "countersign session record <txHash>" },
          ],
  });
}

// ── sessions ───────────────────────────────────────────────────────────────────────────────────

interface SessionTx {
  hash: Hex;
  builtin: boolean;
}
interface SessionState {
  chainId: number;
  versionId: Hex;
  skillDir: string;
  wallet: Address;
  startNonce: number;
  startBlock: string;
  startedAt: string;
  txs: SessionTx[];
}

const stateDir = () => process.env.COUNTERSIGN_HOME ?? join(homedir(), ".countersign");
const sessionFile = () => join(stateDir(), "session.json");

async function loadSession(): Promise<SessionState | null> {
  try {
    return JSON.parse(await readFile(sessionFile(), "utf8")) as SessionState;
  } catch {
    return null;
  }
}

async function saveSession(s: SessionState): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  const tmp = `${sessionFile()}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2));
  await rename(tmp, sessionFile());
}

/** countersign session start|record|status|end|clear */
export async function cmdSession(args: Args): Promise<Result> {
  const sub = args.positionals[1];
  if (sub === "start") return sessionStart(args);
  if (sub === "record") return sessionRecord(args);
  if (sub === "status") return sessionStatus();
  if (sub === "end") return sessionEnd(args);
  if (sub === "clear") {
    await rm(sessionFile(), { force: true });
    return { ok: true, command: "session clear", say: "Session cleared." };
  }
  throw new UsageError("usage: countersign session start --skill <dir> --wallet <addr> | record <txHash> [--builtin] | status | end | clear");
}

async function sessionStart(args: Args): Promise<Result> {
  const ctx = await loadContext(args);
  const dir = resolve(flag(args, "skill") ?? args.positionals[2] ?? "");
  const wallet = addressArg(flag(args, "wallet"), "--wallet");
  const skill = await loadSkill(dir);
  const { versionId, registered } = await versionOf(ctx, skill);
  if (!versionId) return { ok: false, command: "session start", say: "This skill has no valid countersign.json with an Agent ID publisher, so a session cannot be countersigned." };
  const existing = await loadSession();
  const startNonce = await ctx.reader.client.getTransactionCount({ address: wallet, blockTag: "latest" });
  const startBlock = await ctx.reader.getBlockNumber();
  await saveSession({ chainId: ctx.chainId, versionId, skillDir: dir, wallet, startNonce, startBlock: startBlock.toString(), startedAt: new Date().toISOString(), txs: [] });
  const reasons: Reason[] = [];
  if (existing) reasons.push({ level: "info", text: "an earlier unfinished session was replaced" });
  if (!registered) reasons.push({ level: "warn", text: "this version is not registered yet; the session can be checked but not countersigned" });
  return {
    ok: true,
    command: "session start",
    say: `Session started for version ${versionId.slice(0, 10)}… (wallet nonce ${startNonce}). After each executed call, run: countersign session record <txHash>`,
    reasons,
    data: { versionId, wallet, startNonce, startBlock },
  };
}

async function sessionRecord(args: Args): Promise<Result> {
  const s = await loadSession();
  if (!s) return { ok: false, command: "session record", say: "No active session. Run: countersign session start --skill <dir> --wallet <addr>" };
  const hash = args.positionals[2];
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new UsageError("usage: countersign session record <txHash> [--builtin]");
  if (!s.txs.some((t) => t.hash.toLowerCase() === hash.toLowerCase())) s.txs.push({ hash: hash.toLowerCase() as Hex, builtin: bool(args, "builtin") });
  await saveSession(s);
  return { ok: true, command: "session record", say: `Recorded ${s.txs.length} transaction(s) in this session.`, data: { txs: s.txs } };
}

async function sessionStatus(): Promise<Result> {
  const s = await loadSession();
  if (!s) return { ok: true, command: "session status", say: "No active session." };
  return { ok: true, command: "session status", say: `Session for ${s.versionId.slice(0, 10)}… since ${s.startedAt}: ${s.txs.length} recorded tx(s).`, data: { session: s } };
}

async function sessionEnd(args: Args): Promise<Result> {
  const s = await loadSession();
  if (!s) return { ok: false, command: "session end", say: "No active session." };
  const ctx = await loadContext({ ...args, flags: new Map([...args.flags, ["chain", String(s.chainId)]]) });
  const reasons: Reason[] = [];
  const version = await readVersion(ctx.reader, ctx.deployment, s.versionId);
  const nonceNow = await ctx.reader.client.getTransactionCount({ address: s.wallet, blockTag: "latest" });
  const sent = nonceNow - s.startNonce;
  const unexplained = sent - s.txs.length;
  if (unexplained > 0) {
    reasons.push({
      level: "block",
      text: `${unexplained} transaction(s) left this wallet during the session that COUNTERSIGN never saw. Check \`baw wallet tx-history --json\` with the user; if any is unexpected, report it`,
    });
  } else {
    reasons.push({ level: "ok", text: `every transaction from this wallet during the session was recorded (${sent})` });
  }
  const calls = s.txs.filter((t) => !t.builtin).map((t) => t.hash);
  if (s.txs.some((t) => t.builtin)) reasons.push({ level: "info", text: "built-in wallet actions (swaps etc.) are not citable: their calldata is not visible to the agent" });
  if (!version) {
    reasons.push({ level: "warn", text: "the version is not registered, so nothing can be countersigned" });
    return { ok: true, command: "session end", verdict: verdictOf(reasons), say: "Session checked; this version is not registered.", reasons };
  }
  if (calls.length === 0) {
    reasons.push({ level: "warn", text: "no contract calls were recorded, so there is nothing to cite" });
    return { ok: true, command: "session end", verdict: verdictOf(reasons), say: "Nothing to countersign.", reasons };
  }

  const agent = await readAgentId(ctx.reader, ctx.deployment.agentId, s.wallet);
  if (!agent) {
    reasons.push({ level: "block", text: "this wallet holds no Agent ID; only Agent ID holders can countersign or report" });
    return { ok: true, command: "session end", verdict: "block", say: "This wallet cannot countersign: it holds no Agent ID.", reasons };
  }
  const head = await ctx.reader.getBlockNumber();
  const cite = calls.slice(-LIMITS.txHashes);
  const record: RecordView = { versionId: s.versionId, agentId: agent.agentId, signer: s.wallet, blockNumber: head, kind: KIND_COUNTERSIGN, txHashes: cite };
  const [countersigns, reports] = await Promise.all([
    readRecords(ctx.reader, ctx.deployment, s.versionId, KIND_COUNTERSIGN),
    readRecords(ctx.reader, ctx.deployment, s.versionId, KIND_REPORT),
  ]);
  const verdict = await evaluateRecord(
    {
      chainId: ctx.chainId,
      version,
      countersigns,
      reports,
      graph: { countersignedAuthors: new Set() },
      ...(ctx.deployment.guardedExecutor ? { guardedExecutor: ctx.deployment.guardedExecutor } : {}),
    },
    ctx.reader,
    record,
  );
  const effectProblems = verdict.reasons.filter((r) => /approval|operator|transfer|value-over-cap|undeclared|code-changed/.test(r));
  if (effectProblems.length) reasons.push({ level: "block", text: `the session went outside the manifest: ${[...new Set(effectProblems)].join(", ")}` });
  const otherProblems = verdict.reasons.filter((r) => !effectProblems.includes(r));
  for (const p of new Set(otherProblems)) reasons.push({ level: p === "no-anchor-hit" ? "warn" : "warn", text: `would not count: ${p}` });

  const dirty = effectProblems.length > 0 || unexplained > 0;
  const base: Result = { ok: true, command: "session end", reasons, verdict: verdictOf(reasons), say: "" };
  if (dirty) {
    const evidence = cite.slice(0, LIMITS.txHashes);
    const data = encodeReport(s.versionId, evidence);
    return {
      ...base,
      say: "This session was not clean. Tell the user what went outside the manifest. If they want, prepare a report (it is public, and counts as a verified incident only if chain data proves it).",
      next: [
        { what: LINKAGE_NOTICE },
        { what: "If the user chooses to report, preview it (sends nothing):", run: bawPreview(ctx.chainId, s.wallet, ctx.deployment.countersign, data) },
        { what: "Execute only after an explicit yes: baw contract-call execute --requestId <requestId> --json" },
      ],
      data: { versionId: s.versionId, cited: evidence, calldata: data },
    };
  }
  if (verdict.status === "rejected") {
    return { ...base, say: "The session was clean, but a countersign would not count (see reasons). Nothing to sign.", data: { versionId: s.versionId } };
  }
  const data = encodeCountersign(s.versionId, cite);
  try {
    await ctx.reader.client.simulateContract({ account: s.wallet, address: ctx.deployment.countersign, abi: countersignAbi, functionName: "countersign", args: [s.versionId, cite] });
  } catch (e) {
    reasons.push({ level: "block", text: `simulated countersign() reverts: ${(e as Error).message.split("\n")[0]}` });
    return { ...base, verdict: "block", say: "A countersign would revert (see reasons).", reasons };
  }
  return {
    ...base,
    say: "Your session was clean and verifiable. Offer the user to countersign this skill version (one small, zero-value transaction).",
    next: [
      { what: LINKAGE_NOTICE },
      { what: "If the user agrees, preview it (sends nothing):", run: bawPreview(ctx.chainId, s.wallet, ctx.deployment.countersign, data) },
      { what: "Execute only after an explicit yes: baw contract-call execute --requestId <requestId> --json; then: countersign session clear" },
    ],
    data: { versionId: s.versionId, cited: cite, calldata: data },
  };
}

// ── manual countersign / report ────────────────────────────────────────────────────────────────

async function manual(args: Args, kind: "countersign" | "report"): Promise<Result> {
  const ctx = await loadContext(args);
  const versionId = args.positionals[1] as Hex | undefined;
  if (!versionId || !/^0x[0-9a-fA-F]{64}$/.test(versionId)) throw new UsageError(`usage: countersign ${kind} <versionId> <txHash>... --from <wallet>`);
  const txs = [...args.positionals.slice(2), ...list(args, "txs")];
  const from = addressArg(flag(args, "from"), "--from");
  const data = kind === "countersign" ? encodeCountersign(versionId, txs) : encodeReport(versionId, txs);
  try {
    await ctx.reader.client.simulateContract({
      account: from,
      address: ctx.deployment.countersign,
      abi: countersignAbi,
      functionName: kind,
      args: [versionId, txs as Hex[]],
    });
  } catch (e) {
    return { ok: false, command: kind, say: `Simulated ${kind}() reverts: ${(e as Error).message.split("\n")[0]}` };
  }
  return {
    ok: true,
    command: kind,
    say: `Ready. ${LINKAGE_NOTICE}`,
    next: [
      { what: "Preview (sends nothing):", run: bawPreview(ctx.chainId, from, ctx.deployment.countersign, data) },
      { what: "Execute only after an explicit yes: baw contract-call execute --requestId <requestId> --json" },
    ],
    data: { calldata: data },
  };
}

export const cmdCountersign = (args: Args) => manual(args, "countersign");
export const cmdReport = (args: Args) => manual(args, "report");

/** countersign status <versionId | skill-dir> [--verify-local] */
export async function cmdStatus(args: Args): Promise<Result> {
  const ctx = await loadContext(args);
  const arg = args.positionals[1];
  if (!arg) throw new UsageError("usage: countersign status <versionId | skill-dir>");
  let versionId = /^0x[0-9a-fA-F]{64}$/.test(arg) ? (arg as Hex) : null;
  if (!versionId) versionId = (await versionOf(ctx, await loadSkill(arg))).versionId;
  if (!versionId) return { ok: false, command: "status", say: "Could not compute a version id (no valid countersign.json, or the publisher holds no Agent ID)." };
  const { report, source } = await versionStatus(ctx, versionId, { local: bool(args, "verify-local"), noContent: bool(args, "no-content") });
  if (!report) return { ok: true, command: "status", say: "This version is not registered." };
  return {
    ok: true,
    command: "status",
    say: `${report.status.toUpperCase()}: countersigned by ${report.countersigns.counted}, ${report.incidents.length} verified incident(s), ${report.claims.total} unverified report(s) [${source}, ${report.ruleset}].`,
    data: { report },
  };
}


// ── choosing between skills (§6.3) ─────────────────────────────────────────────────────────────

export interface Candidate {
  name: string;
  versionId: Hex | null;
  /** A harmful red-line finding in its files, or a verified incident: never prefer it. */
  blocked: string | null;
  signal: HumanSignal;
}

/** Incidents and harmful findings rank last, then more verified countersigns, established, attested, registered. */
export function rankCandidates(list: readonly Candidate[]): Candidate[] {
  const key = (c: Candidate): number[] => [
    c.blocked || c.signal.incidents > 0 ? 1 : 0,
    -c.signal.counted,
    -(c.signal.established ?? 0),
    c.signal.attested ? 0 : 1,
    c.signal.registered ? 0 : 1,
  ];
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return a.name.localeCompare(b.name);
  });
}

/**
 * countersign choose <skill-dir | versionId> <skill-dir | versionId> ...
 * The decision fake downloads used to make: which of these skills should the agent pick? By verified
 * countersigns and incidents, never by popularity.
 */
export async function cmdChoose(args: Args): Promise<Result> {
  const items = args.positionals.slice(1);
  if (items.length < 2) throw new UsageError("usage: countersign choose <skill-dir | versionId> <skill-dir | versionId> ...");
  const ctx = await loadContextOrNull(args);
  const candidates: Candidate[] = [];
  for (const item of items) {
    const signal: HumanSignal = { registered: false, attested: false, guarded: 0, counted: 0, established: null, incidents: 0 };
    let blocked: string | null = null;
    let versionId: Hex | null = /^0x[0-9a-fA-F]{64}$/.test(item) ? (item as Hex) : null;
    let name = versionId ? `${versionId.slice(0, 10)}…` : item;
    if (!versionId) {
      const skill = await loadSkill(item);
      name = skill.manifest?.name ?? item;
      const harmful = skill.redline.results.filter((r) => !r.passed && HARMFUL_RULES.has(r.rule)).map((r) => r.rule);
      if (harmful.length) blocked = `fails ${harmful.join(", ")}`;
      if (ctx) versionId = (await versionOf(ctx, skill)).versionId;
    }
    if (ctx && versionId) {
      const { report } = await versionStatus(ctx, versionId, { local: bool(args, "verify-local"), noContent: bool(args, "no-content") });
      if (report) {
        signal.registered = true;
        signal.attested = report.attestation.status === "passed";
        signal.guarded = report.anchors.guarded;
        signal.counted = report.countersigns.counted;
        signal.established = report.countersigns.established;
        signal.incidents = report.incidents.length;
        if (report.incidents.length) blocked ??= `${report.incidents.length} verified incident${report.incidents.length === 1 ? "" : "s"}`;
      }
    }
    candidates.push({ name, versionId, blocked, signal });
  }
  const ranked = rankCandidates(candidates);
  const top = ranked[0]!;
  const reasons: Reason[] = ranked.map((c, i) => ({
    level: c.blocked ? "block" : c.signal.counted > 0 ? "ok" : "warn",
    text: `${i + 1}. ${c.name}: ${signalLine(c.signal)}${c.blocked ? ` · do not use: ${c.blocked}` : ""}`,
  }));
  if (!ctx) reasons.push({ level: "info", text: "COUNTERSIGN is not deployed on this chain yet: ranked by the Red-Line Check only" });
  return {
    ok: true,
    command: "choose",
    verdict: top.blocked ? "block" : top.signal.counted > 0 ? "allow" : "warn",
    say: top.blocked
      ? "None of these is safe to prefer: every one fails a red line or has a verified incident."
      : `Prefer ${top.name}: ${signalLine(top.signal)}.`,
    reasons,
    data: { ranking: ranked },
  };
}
