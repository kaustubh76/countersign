import { getAddress, isAddressEqual, zeroAddress, type Address, type Hex } from "viem";
import {
  computeVersionId,
  encodeEndorseAnchor,
  encodeRegister,
  FLAG_ANCHOR,
  readAgentId,
  readVersion,
  skillRegistryAbi,
} from "@countersign/core";
import { allPassed } from "@countersign/redline";
import { bool, flag, type Args } from "./args.js";
import { addressArg, bawPreview, loadContext, UsageError, type Context } from "./context.js";
import type { Reason, Result } from "./output.js";
import { loadSkill, type LoadedSkill } from "./skill.js";

const OWNER_ABI = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

async function ownerOf(ctx: Context, target: Address): Promise<Address | null> {
  try {
    return await ctx.reader.client.readContract({ address: target, abi: OWNER_ABI, functionName: "owner" });
  } catch {
    return null;
  }
}

function skillDirArg(args: Args): string {
  const dir = args.positionals[1];
  if (!dir) throw new UsageError("missing <skill-dir>");
  return dir;
}

function redlineReasons(skill: LoadedSkill): Reason[] {
  const out: Reason[] = [];
  for (const r of skill.redline.results) {
    if (r.passed && r.findings.length === 0) continue;
    for (const finding of r.findings) {
      out.push({
        level: finding.severity === "fail" ? "block" : "warn",
        text: `${r.rule} ${finding.message} (${finding.file}:${finding.line})`,
      });
    }
  }
  return out;
}

/** countersign hash <skill-dir>: content hash, file list, manifest hash. */
export async function cmdHash(args: Args): Promise<Result> {
  const skill = await loadSkill(skillDirArg(args));
  return {
    ok: true,
    command: "hash",
    say: `Content hash ${skill.content.contentHash} over ${skill.content.files.length} files.`,
    data: {
      contentHash: skill.content.contentHash,
      manifestHash: skill.manifest?.manifestHash ?? null,
      publisher: skill.manifest?.publisher ?? null,
      files: skill.content.files,
      manifestProblem: skill.manifestProblem,
    },
  };
}

/** countersign manifest <skill-dir>: validate countersign.json and show the on-chain form. */
export async function cmdManifest(args: Args): Promise<Result> {
  const skill = await loadSkill(skillDirArg(args));
  if (!skill.manifest) return { ok: false, command: "manifest", say: skill.manifestProblem ?? "no manifest" };
  const m = skill.manifest;
  return {
    ok: true,
    command: "manifest",
    say: `countersign.json is valid: ${m.onchain.targets.length} targets, ${m.onchain.permissions.length} functions, ${m.onchain.flows.length} flows.`,
    data: { manifestHash: m.manifestHash, publisher: m.publisher, onchain: m.onchain, builtins: m.builtins },
  };
}

/** countersign redline <skill-dir>: the static Red-Line Check, with its report hash. */
export async function cmdRedline(args: Args): Promise<Result> {
  const skill = await loadSkill(skillDirArg(args), { checkerCommit: flag(args, "checker-commit") ?? null });
  const passed = allPassed(skill.redline);
  return {
    ok: true,
    command: "redline",
    verdict: passed ? "allow" : "block",
    say: passed
      ? "Red-Line Check passed every rule."
      : `Red-Line Check failed: ${skill.redline.results.filter((r) => !r.passed).map((r) => r.rule).join(", ")}.`,
    reasons: redlineReasons(skill),
    data: { reportHash: skill.redlineHash, report: skill.redline },
  };
}

/**
 * countersign register <skill-dir> --uri <contentURI> [--from <wallet>]
 * Validates everything that would make the tx revert or the version non-canonical, simulates the call,
 * then prints the `baw contract-call preview` command.
 */
export async function cmdRegister(args: Args): Promise<Result> {
  const ctx = await loadContext(args);
  const skill = await loadSkill(skillDirArg(args), { extraKnown: [ctx.deployment.skillRegistry, ctx.deployment.countersign] });
  const uri = flag(args, "uri");
  if (!uri) throw new UsageError("missing --uri <contentURI>, e.g. https://github.com/<owner>/<repo>/tree/<commit>/<path>");
  if (!skill.manifest) return { ok: false, command: "register", say: skill.manifestProblem ?? "no manifest" };
  const m = skill.manifest;
  const reasons: Reason[] = [];

  if (m.chainId !== ctx.chainId) reasons.push({ level: "block", text: `countersign.json is for chain ${m.chainId}, not ${ctx.chainId}` });
  const from = flag(args, "from") ? addressArg(flag(args, "from"), "--from") : m.publisher;
  if (!isAddressEqual(from, m.publisher)) {
    reasons.push({
      level: "block",
      text: `registering from ${from}, but countersign.json names ${m.publisher} as publisher; the version would not be canonical`,
    });
  }
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[0-9a-f]{7,40}(\/.*)?$/.test(uri)) {
    reasons.push({
      level: "warn",
      text: "contentURI is not a GitHub tree URL pinned to a commit, so verifiers cannot fetch and re-hash the content",
    });
  }

  const agent = await readAgentId(ctx.reader, ctx.deployment.agentId, from);
  if (!agent) {
    reasons.push({ level: "block", text: `${from} holds no Agent ID; only Agent ID holders can register` });
    return { ok: false, command: "register", say: "Cannot register: the publisher wallet has no Agent ID.", reasons };
  }
  reasons.push({ level: "ok", text: `publisher holds an Agent ID (tokenId ${agent.agentId})` });

  const versionId = computeVersionId(skill.content.contentHash, m.manifestHash, agent.agentId);
  const existing = await readVersion(ctx.reader, ctx.deployment, versionId);
  if (existing) {
    return {
      ok: true,
      command: "register",
      say: `This exact version is already registered (block ${existing.registeredBlock}). Nothing to do.`,
      data: { versionId, contentHash: skill.content.contentHash, manifestHash: m.manifestHash },
    };
  }

  const endorseNeeded: { index: number; owner: Address }[] = [];
  for (const [i, t] of m.onchain.targets.entries()) {
    const code = await ctx.reader.getCode(t.target);
    if (!code || code === "0x") {
      reasons.push({ level: "block", text: `target ${t.target} has no contract code on chain ${ctx.chainId}` });
      continue;
    }
    if ((t.flags & FLAG_ANCHOR) === 0) continue;
    const owner = await ownerOf(ctx, t.target);
    if (!owner || owner === zeroAddress) {
      reasons.push({ level: "block", text: `anchor ${t.target} has no owner(), so it can never be endorsed` });
    } else if (isAddressEqual(owner, from)) {
      reasons.push({ level: "ok", text: `anchor ${t.target} is owned by the publisher and is endorsed automatically` });
    } else {
      endorseNeeded.push({ index: i, owner: getAddress(owner) });
      reasons.push({
        level: "warn",
        text: `anchor ${t.target} is owned by ${owner}; that key must call endorseAnchor after registration`,
      });
    }
  }
  if (!m.onchain.targets.some((t) => (t.flags & FLAG_ANCHOR) !== 0)) {
    reasons.push({ level: "warn", text: "no anchor declared: countersigns cannot count until an author-owned contract is declared" });
  }

  reasons.push(...redlineReasons(skill));
  if (!allPassed(skill.redline) && !bool(args, "force")) {
    reasons.push({ level: "block", text: "fix the Red-Line findings first (or pass --force to register anyway)" });
  }

  const data = encodeRegister(skill.content.contentHash, uri, m.onchain);
  if (!reasons.some((r) => r.level === "block")) {
    try {
      await ctx.reader.client.simulateContract({
        account: from,
        address: ctx.deployment.skillRegistry,
        abi: skillRegistryAbi,
        functionName: "register",
        args: [skill.content.contentHash, uri, m.onchain.targets, m.onchain.permissions, m.onchain.flows],
      });
      reasons.push({ level: "ok", text: "simulated register() succeeds" });
    } catch (e) {
      reasons.push({ level: "block", text: `simulated register() reverts: ${(e as Error).message.split("\n")[0]}` });
    }
  }

  const blocked = reasons.some((r) => r.level === "block");
  return {
    ok: !blocked,
    command: "register",
    verdict: blocked ? "block" : reasons.some((r) => r.level === "warn") ? "warn" : "allow",
    say: blocked
      ? "Not ready to register; see the reasons."
      : `Ready to register version ${versionId}. Preview it, show the user, and execute only after they say yes.`,
    reasons,
    next: blocked
      ? []
      : [
          {
            what: "Preview (sends nothing). Show the user the parsed transaction: target is the COUNTERSIGN SkillRegistry, value 0, no token movement.",
            run: bawPreview(ctx.chainId, from, ctx.deployment.skillRegistry, data),
          },
          { what: "Only after the user explicitly says yes: baw contract-call execute --requestId <requestId from the preview> --json" },
          ...endorseNeeded.map((e) => ({
            what: `Then the owner of target #${e.index} (${e.owner}) endorses the anchor`,
            run: `countersign endorse ${versionId} ${e.index}`,
          })),
        ],
    data: { versionId, contentHash: skill.content.contentHash, manifestHash: m.manifestHash, registrantAgentId: agent.agentId, calldata: data },
  };
}

/** countersign endorse <versionId> <targetIndex> [--from <owner>] */
export async function cmdEndorse(args: Args): Promise<Result> {
  const ctx = await loadContext(args);
  const versionId = args.positionals[1] as Hex | undefined;
  const index = Number(args.positionals[2]);
  if (!versionId || !/^0x[0-9a-fA-F]{64}$/.test(versionId)) throw new UsageError("missing <versionId>");
  if (!Number.isInteger(index) || index < 0) throw new UsageError("missing <targetIndex>");
  const v = await readVersion(ctx.reader, ctx.deployment, versionId);
  if (!v) return { ok: false, command: "endorse", say: "That version is not registered." };
  const t = v.targets[index];
  if (!t) return { ok: false, command: "endorse", say: `Version has no target #${index}.` };
  if ((t.flags & FLAG_ANCHOR) === 0) return { ok: false, command: "endorse", say: `Target #${index} is not declared as an anchor.` };
  if (t.endorser !== zeroAddress) return { ok: true, command: "endorse", say: `Target #${index} is already endorsed by ${t.endorser}.` };
  const owner = await ownerOf(ctx, t.target);
  if (!owner) return { ok: false, command: "endorse", say: `Target ${t.target} has no owner(); it cannot be an anchor.` };
  const from = flag(args, "from") ? addressArg(flag(args, "from"), "--from") : owner;
  const data = encodeEndorseAnchor(versionId, index);
  return {
    ok: true,
    command: "endorse",
    say: `Target #${index} (${t.target}) must be endorsed by its owner ${owner}.`,
    next: [
      { what: "If the owner is an Agentic Wallet, preview and confirm:", run: bawPreview(ctx.chainId, from, ctx.deployment.skillRegistry, data) },
      {
        what: "If the owner is a plain EOA (e.g. a deployer key):",
        run: `cast send ${ctx.deployment.skillRegistry} "endorseAnchor(bytes32,uint8)" ${versionId} ${index} --rpc-url <bsc-rpc> --private-key <owner key>`,
      },
    ],
    data: { calldata: data, owner },
  };
}
