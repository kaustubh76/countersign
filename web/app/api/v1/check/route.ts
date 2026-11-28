import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { FLAG_ANCHOR, fetchGithubSkill, hashSkillFiles, MANIFEST_FILE, parseManifest, type ParsedManifest } from "@countersign/core";
import { checkSkill, contractCandidates, reportHash } from "@countersign/redline";
import { analyzeForCheck, RL4_CHAIN_ID } from "@/lib/rl4";

export const runtime = "nodejs";
export const maxDuration = 60;

// Best-effort per-instance rate limit: the check is read-only, but it fetches a tarball from GitHub.
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n++;
  return h.n > 6;
}

/**
 * POST /api/v1/check {uri, contracts?}: the Red-Line Check of a commit-pinned GitHub skill folder. RL4 reads the
 * verified source of the skill's contracts (the manifest's targets, plus `contracts`: the author's own). Read-only.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "too many checks; try again in a minute" }, { status: 429 });
  let uri = "";
  let given: Address[] = [];
  try {
    const body = (await req.json()) as { uri?: unknown; contracts?: unknown };
    uri = String(body.uri ?? "").trim();
    const raw = body.contracts === undefined ? [] : Array.isArray(body.contracts) ? body.contracts : String(body.contracts).split(/[\s,]+/);
    given = raw.map((a) => String(a).trim()).filter(Boolean) as Address[];
  } catch {
    return NextResponse.json({ error: "send JSON: {\"uri\": \"https://github.com/<owner>/<repo>/tree/<commit>/<path>\", \"contracts\": [\"0x…\"]}" }, { status: 400 });
  }
  if (given.length > 16) return NextResponse.json({ error: "at most 16 contracts" }, { status: 400 });
  const bad = given.find((a: string) => !isAddress(a, { strict: false })) as string | undefined;
  if (bad) return NextResponse.json({ error: `not an address: ${bad.slice(0, 60)}` }, { status: 400 });
  try {
    const files = await fetchGithubSkill(uri);
    const { contentHash } = hashSkillFiles(files);
    const manifestFile = files.find((f) => f.path === MANIFEST_FILE);
    let parsed: ParsedManifest | null = null;
    let manifest: { manifestHash: string; publisher: string; targets: number; flows: number; anchors: number } | null = null;
    let manifestProblem: string | null = null;
    if (manifestFile) {
      try {
        const m = parseManifest(JSON.parse(new TextDecoder().decode(manifestFile.bytes)));
        parsed = m;
        manifest = {
          manifestHash: m.manifestHash,
          publisher: m.publisher,
          targets: m.onchain.targets.length,
          flows: m.onchain.flows.length,
          anchors: m.onchain.targets.filter((t) => (t.flags & FLAG_ANCHOR) !== 0).length,
        };
      } catch (e) {
        manifestProblem = (e as Error).message;
      }
    } else {
      manifestProblem = `no ${MANIFEST_FILE} in the skill folder`;
    }
    // RL4 reads BNB Smart Chain contracts; a manifest for another chain skips it (and the report says so)
    const onChain = (parsed?.chainId ?? RL4_CHAIN_ID) === RL4_CHAIN_ID;
    const contracts = onChain ? await analyzeForCheck(contractCandidates(files, parsed, given)) : undefined;
    const report = checkSkill(files, { projectContracts: given, ...(contracts ? { contracts } : {}) });
    return NextResponse.json({ uri, contentHash, fileCount: files.length, manifest, manifestProblem, reportHash: reportHash(report), report });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
