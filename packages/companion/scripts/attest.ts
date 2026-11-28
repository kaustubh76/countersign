/**
 * The Red-Line attester (ideation §5.1: "a pass produces an on-chain attestation"; §14: "publish every check's
 * inputs and outputs so anyone can rerun it"). An operator tool, not part of the user's skill bundle.
 *
 *   pnpm attest <versionId> --from <attester address> [--content <dir>] [--allow-partial]
 *   pnpm attest <versionId> --verify            re-run the check and compare with every attestation on-chain
 *
 * For a registered version it fetches the files the version points at, re-checks that they are the canonical
 * content (hash, manifest, publisher) and that the declared contracts still run the registered code, then runs
 * the full Red-Line Check with RL4. It writes a report only if every checked rule passed: failures are never
 * published, they go back to the author. Then it prints the attest calldata and a `cast send` command for the
 * attester key. It never signs or sends anything; an on-chain attestation is a deliberate, separate step.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAddressEqual, keccak256, type Address, type Hex } from "viem";
import {
  encodeAttest,
  fetchGithubSkill,
  hashSkillFiles,
  MANIFEST_FILE,
  parseManifest,
  readSkillDir,
  readVersion,
  skillRegistryAbi,
  type ParsedManifest,
  type SkillFile,
} from "@countersign/core";
import { allPassed, checkSkill, reportHash as hashReport, RULE_BITS, type RedlineReport } from "@countersign/redline";
import { bool, flag, parseArgs } from "../src/args.js";
import { addressArg, loadContext, UsageError } from "../src/context.js";
import { withOwnerPowers } from "../src/ownerPowers.js";
import { print, type Reason, type Result } from "../src/output.js";
import type { LoadedSkill } from "../src/skill.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_CHAINS = new Set([31337, 1337]);
const git = (...a: string[]) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8" }).trim();

/** The commit of the checker that runs: the repository HEAD, clean and pushed (except on a local chain). */
function checkerCommit(chainId: number, given: string | undefined): string {
  if (LOCAL_CHAINS.has(chainId) && given) return given;
  const head = git("rev-parse", "HEAD");
  if (LOCAL_CHAINS.has(chainId)) return head;
  if (given && given !== head) throw new UsageError("--checker-commit must be the checked-out HEAD on a public chain");
  if (git("status", "--porcelain", "--", "packages/core", "packages/redline", "packages/companion")) {
    throw new UsageError("the checker has uncommitted changes: commit them first, so the report names the code that ran");
  }
  if (!git("branch", "-r", "--contains", head)) throw new UsageError("push HEAD first, so anyone can re-run the checker from its commit");
  return head;
}

export interface AttestationFile {
  schema: "countersign.attestation/v1";
  chainId: number;
  versionId: Hex;
  registry: Address;
  contentURI: string;
  checkerCommit: string;
  rulesChecked: number;
  rulesPassed: number;
  reportHash: Hex;
  report: RedlineReport;
}

async function main(argv: readonly string[]): Promise<Result> {
  const args = parseArgs(argv);
  const versionId = args.positionals[0] as Hex | undefined;
  if (!versionId || !/^0x[0-9a-fA-F]{64}$/.test(versionId)) throw new UsageError("usage: attest <versionId> --from <attester> [--content <dir>] [--verify]");
  const verify = bool(args, "verify");
  const ctx = await loadContext(args);
  const reasons: Reason[] = [];
  const refuse = (say: string): Result => ({ ok: false, command: "attest", verdict: "block", say, reasons });

  const v = await readVersion(ctx.reader, ctx.deployment, versionId);
  if (!v) return refuse("That version is not registered.");

  // 1. the canonical content (C1): the files the version points at, by the publisher it names
  const dir = flag(args, "content");
  let files: SkillFile[];
  try {
    files = dir ? await readSkillDir(resolve(dir)) : await fetchGithubSkill(v.contentURI);
  } catch (e) {
    return refuse(`Could not read the content: ${(e as Error).message}`);
  }
  const content = hashSkillFiles(files);
  if (content.contentHash !== v.contentHash) reasons.push({ level: "block", text: "the files do not hash to the registered contentHash" });
  const manifestFile = files.find((f) => f.path === MANIFEST_FILE);
  let manifest: ParsedManifest | null = null;
  try {
    manifest = manifestFile ? parseManifest(JSON.parse(new TextDecoder().decode(manifestFile.bytes))) : null;
  } catch (e) {
    reasons.push({ level: "block", text: `countersign.json is invalid: ${(e as Error).message}` });
  }
  if (!manifest) reasons.push({ level: "block", text: "no valid countersign.json in the content" });
  else {
    if (manifest.manifestHash !== v.manifestHash) reasons.push({ level: "block", text: "countersign.json does not encode to the registered manifestHash" });
    if (!isAddressEqual(manifest.publisher, v.registrant)) reasons.push({ level: "block", text: "not the canonical version: the registrant is not the publisher named in countersign.json" });
  }
  // 2. the declared contracts still run the code they ran at registration
  for (const t of v.targets) {
    const code = await ctx.reader.getCode(t.target);
    if (!code || keccak256(code) !== t.codehash) reasons.push({ level: "block", text: `${t.target}: its code changed since registration` });
  }
  if (reasons.some((r) => r.level === "block")) return refuse("Not attestable: this is not the canonical, unchanged version.");

  // 3. the full Red-Line Check, RL4 included
  const commit = checkerCommit(ctx.chainId, flag(args, "checker-commit"));
  const extraKnown = [ctx.deployment.skillRegistry, ctx.deployment.countersign, ...(ctx.deployment.guardedExecutor ? [ctx.deployment.guardedExecutor] : [])];
  const base = checkSkill(files, { extraKnown, checkerCommit: commit });
  const loaded: LoadedSkill = { dir: dir ?? v.contentURI, files, content, manifest, manifestProblem: null, redline: base, redlineHash: hashReport(base) };
  const { redline: report } = await withOwnerPowers(loaded, args, { reader: ctx.reader, chainId: ctx.chainId, extraKnown, checkerCommit: commit });
  const reportHash = hashReport(report);
  const rl4Checked = (report.rulesChecked & RULE_BITS.RL4) !== 0;

  if (verify) {
    const [list, active] = await ctx.reader.client.readContract({ address: ctx.deployment.skillRegistry, abi: skillRegistryAbi, functionName: "attestationsOf", args: [versionId] });
    if (!list.length) return { ok: true, command: "attest --verify", say: "No attestation on-chain for this version yet.", data: { reportHash } };
    for (const [i, a] of list.entries()) {
      const same = a.reportHash.toLowerCase() === reportHash.toLowerCase();
      reasons.push({
        level: same ? "ok" : a.checkerCommit.toLowerCase() === `0x${commit}`.toLowerCase() ? "block" : "warn",
        text: `${a.attester}${active[i] ? "" : " (not active)"}: ${same ? "the re-run gives the same report hash" : `different report hash (attested with checker ${a.checkerCommit.slice(0, 10)}…; this run used ${commit.slice(0, 8)}…)`}`,
      });
    }
    const ok = !reasons.some((r) => r.level === "block");
    return { ok, command: "attest --verify", verdict: ok ? "allow" : "block", say: ok ? "Re-run checked against the on-chain attestations." : "A re-run with the same checker gives a different report.", reasons, data: { reportHash } };
  }

  if (!allPassed(report)) {
    for (const r of report.results) for (const f of r.findings) if (f.severity === "fail") reasons.push({ level: "block", text: `${r.rule} ${f.message}` });
    return refuse("Not attested: some rules fail. Nothing was written; send the author the reasons privately, never publish them.");
  }
  if (!rl4Checked && !bool(args, "allow-partial")) {
    for (const n of report.notes) if (n.startsWith("RL4")) reasons.push({ level: "warn", text: n });
    return refuse("Not attested: RL4 (owner powers) could not be checked. Verify the contracts on Sourcify, or pass --allow-partial to attest without RL4.");
  }

  // 4. the attester must be enabled, and the call must succeed
  const from = addressArg(flag(args, "from"), "--from <attester address>");
  const enabled = await ctx.reader.client.readContract({ address: ctx.deployment.skillRegistry, abi: skillRegistryAbi, functionName: "isAttester", args: [from] });
  if (!enabled) return refuse(`${from} is not an enabled attester on this registry.`);
  const commit20 = `0x${commit}` as Hex;
  await ctx.reader.client.simulateContract({
    account: from,
    address: ctx.deployment.skillRegistry,
    abi: skillRegistryAbi,
    functionName: "attest",
    args: [versionId, report.rulesChecked, report.rulesPassed, commit20, reportHash],
  });

  // 5. publish the inputs and outputs before anything points at them
  const out = resolve(flag(args, "out") ?? join(ROOT, "web/public/attestations"));
  const file = join(out, String(ctx.chainId), `${versionId.toLowerCase()}.json`);
  const doc: AttestationFile = {
    schema: "countersign.attestation/v1",
    chainId: ctx.chainId,
    versionId: versionId.toLowerCase() as Hex,
    registry: ctx.deployment.skillRegistry,
    contentURI: v.contentURI,
    checkerCommit: commit,
    rulesChecked: report.rulesChecked,
    rulesPassed: report.rulesPassed,
    reportHash,
    report,
  };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
  const calldata = encodeAttest(versionId, report.rulesChecked, report.rulesPassed, commit20, reportHash);
  return {
    ok: true,
    command: "attest",
    verdict: "allow",
    say: `Every checked rule passed${rl4Checked ? ", owner powers (RL4) included" : " (RL4 not checked)"}. Report written; publish it, then attest.`,
    reasons,
    next: [
      { what: "1. Publish the report first (it is what the attestation points at):", run: `git add ${relative(process.cwd(), file)} && git commit -m "attest: ${versionId.slice(0, 10)}" && git push` },
      {
        what: "2. Then, with the attester key and the operator's explicit go-ahead (this sends a transaction):",
        run: `cast send ${ctx.deployment.skillRegistry} ${calldata} --rpc-url <rpc> --private-key $ATTESTER_PRIVATE_KEY`,
      },
    ],
    data: { file, reportHash, rulesChecked: report.rulesChecked, rulesPassed: report.rulesPassed, checkerCommit: commit, calldata },
  };
}

main(process.argv.slice(2)).then(
  (result) => {
    print(result, process.argv.includes("--json"));
    process.exit(result.ok ? 0 : 1);
  },
  (e: unknown) => {
    print({ ok: false, command: "attest", say: (e as Error).message }, process.argv.includes("--json"));
    process.exit(e instanceof UsageError ? 2 : 1);
  },
);
