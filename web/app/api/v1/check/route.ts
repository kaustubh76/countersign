import { NextResponse } from "next/server";
import { fetchGithubSkill, hashSkillFiles, MANIFEST_FILE, parseManifest } from "@countersign/core";
import { checkSkill, reportHash } from "@countersign/redline";

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

/** POST /api/v1/check {uri}: static Red-Line Check of a commit-pinned GitHub skill folder. Read-only, no keys. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "too many checks; try again in a minute" }, { status: 429 });
  let uri = "";
  try {
    uri = String(((await req.json()) as { uri?: unknown }).uri ?? "").trim();
  } catch {
    return NextResponse.json({ error: "send JSON: {\"uri\": \"https://github.com/<owner>/<repo>/tree/<commit>/<path>\"}" }, { status: 400 });
  }
  try {
    const files = await fetchGithubSkill(uri);
    const { contentHash } = hashSkillFiles(files);
    const report = checkSkill(files);
    const manifestFile = files.find((f) => f.path === MANIFEST_FILE);
    let manifest: { manifestHash: string; publisher: string; targets: number; flows: number } | null = null;
    let manifestProblem: string | null = null;
    if (manifestFile) {
      try {
        const m = parseManifest(JSON.parse(new TextDecoder().decode(manifestFile.bytes)));
        manifest = { manifestHash: m.manifestHash, publisher: m.publisher, targets: m.onchain.targets.length, flows: m.onchain.flows.length };
      } catch (e) {
        manifestProblem = (e as Error).message;
      }
    } else {
      manifestProblem = `no ${MANIFEST_FILE} in the skill folder`;
    }
    return NextResponse.json({ uri, contentHash, fileCount: files.length, manifest, manifestProblem, reportHash: reportHash(report), report });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
