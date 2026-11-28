/**
 * Private batch Red-Line Check of public skills (ideation §16.3: "run it on every public hackathon skill you
 * can find; offer free attestations"). An operator tool for outreach.
 *
 *   pnpm scan-skills [notes/hackathon-skills.txt]
 *
 * Each list line is "owner/repo [path] [commit]" or a GitHub tree URL; HEAD is resolved when no commit is
 * given. Every skill gets the full check, with RL4 on the contracts its files mention. Results go to
 * notes/scan-<date>.md and .json, which are gitignored: other teams' findings are sent to them privately and
 * never published.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, type Address } from "viem";
import { createReader, fetchGithubSkill, HARMFUL_REDLINE_RULES, MANIFEST_FILE, parseManifest, rpcUrlsFromEnv, type ParsedManifest } from "@countersign/core";
import { checkSkill, contractCandidates, type RedlineReport } from "@countersign/redline";
import { analyzeContracts } from "@countersign/redline/sources";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OWNER_ABI = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

interface Target {
  owner: string;
  repo: string;
  path: string;
  commit?: string;
}

function parseLine(line: string): Target | null {
  const t = line.replace(/#.*$/, "").trim();
  if (!t) return null;
  const url = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.*))?$/.exec(t);
  if (url) return { owner: url[1]!, repo: url[2]!, commit: /^[0-9a-f]{7,40}$/.test(url[3]!) ? url[3]! : undefined, path: url[4] ?? "" };
  const [repo, path = "", commit] = t.split(/\s+/);
  const [owner, name] = (repo ?? "").split("/");
  return owner && name ? { owner, repo: name, path: path === "." ? "" : path, commit } : null;
}

async function headCommit(t: Target): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${t.owner}/${t.repo}/commits/HEAD`, {
    headers: { accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} resolving HEAD`);
  return ((await res.json()) as { sha: string }).sha;
}

interface Row {
  skill: string;
  uri: string;
  harmful: string[];
  other: string[];
  advisories: string[];
  manifest: boolean;
  contracts: { address: Address; name: string; status: string; undisclosed: string[] }[];
  error?: string;
}

async function main(): Promise<void> {
  const listFile = resolve(process.argv[2] ?? join(ROOT, "notes/hackathon-skills.txt"));
  const targets = (await readFile(listFile, "utf8")).split("\n").map(parseLine).filter((t): t is Target => t !== null);
  const reader = createReader({ chainId: 56, rpcUrls: rpcUrlsFromEnv() });
  const rows: Row[] = [];
  const reports: Record<string, RedlineReport> = {};
  for (const t of targets) {
    const skill = `${t.owner}/${t.repo}${t.path ? `/${t.path}` : ""}`;
    try {
      const commit = t.commit ?? (await headCommit(t));
      const uri = `https://github.com/${t.owner}/${t.repo}/tree/${commit}${t.path ? `/${t.path}` : ""}`;
      const files = await fetchGithubSkill(uri);
      const mf = files.find((f) => f.path === MANIFEST_FILE);
      let manifest: ParsedManifest | null = null;
      try {
        manifest = mf ? parseManifest(JSON.parse(new TextDecoder().decode(mf.bytes))) : null;
      } catch {
        manifest = null;
      }
      const contracts = await analyzeContracts(contractCandidates(files, manifest).slice(0, 8), {
        chainId: 56,
        getCode: (a) => reader.getCode(a),
        getStorageAt: (a, slot) => reader.getStorageAt(a, slot),
        readOwner: async (a) => reader.client.readContract({ address: a, abi: OWNER_ABI, functionName: "owner" }).catch(() => null),
      });
      const report = checkSkill(files, { contracts });
      reports[uri] = report;
      const failed = report.results.filter((r) => !r.passed).map((r) => r.rule);
      rows.push({
        skill,
        uri,
        harmful: failed.filter((r) => HARMFUL_REDLINE_RULES.includes(r)),
        other: failed.filter((r) => !HARMFUL_REDLINE_RULES.includes(r)),
        advisories: [...new Set(report.results.filter((r) => r.passed && r.findings.length).map((r) => r.rule))],
        manifest: Boolean(manifest),
        contracts: (report.input.contracts ?? [])
          .filter((c) => c.status !== "no-code")
          .map((c) => ({
            address: getAddress(c.address),
            name: c.contractName ?? "?",
            status: c.status === "verified" ? `${c.status}/${c.provider}` : c.status,
            undisclosed: [...new Set(c.powers.filter((p) => !p.disclosed && !p.dead).map((p) => p.category))],
          })),
      });
      process.stdout.write(`✓ ${skill}\n`);
    } catch (e) {
      rows.push({ skill, uri: "", harmful: [], other: [], advisories: [], manifest: false, contracts: [], error: (e as Error).message.split("\n")[0] });
      process.stdout.write(`✗ ${skill}: ${(e as Error).message.split("\n")[0]}\n`);
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const out = join(ROOT, "notes", `scan-${date}`);
  await mkdir(dirname(out), { recursive: true });
  const md = [
    `# Red-Line scan of public skills, ${date}`,
    "",
    "> PRIVATE (notes/ is gitignored). Never publish another team's findings: send each team its own result, privately.",
    "",
    "| Skill | Blocks (RL1/2/3/6) | Other red lines | Advisories | countersign.json | Contracts read (undisclosed owner powers) |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) =>
      r.error
        ? `| ${r.skill} | — | — | — | — | could not scan: ${r.error} |`
        : `| [${r.skill}](${r.uri}) | ${r.harmful.join(", ") || "none"} | ${r.other.join(", ") || "none"} | ${r.advisories.join(", ") || "none"} | ${r.manifest ? "yes" : "no"} | ${
            r.contracts.map((c) => `${c.name} ${c.address.slice(0, 8)}… ${c.status}${c.undisclosed.length ? ` (${c.undisclosed.join(", ")})` : ""}`).join("; ") || "none mentioned"
          } |`,
    ),
    "",
    `${rows.filter((r) => !r.error).length} scanned, ${rows.filter((r) => r.error).length} failed, ${rows.filter((r) => !r.error && !r.harmful.length && !r.other.length).length} with no failing red line.`,
    "",
  ].join("\n");
  await writeFile(`${out}.md`, md);
  await writeFile(`${out}.json`, `${JSON.stringify({ date, rows, reports }, null, 2)}\n`);
  process.stdout.write(`wrote ${out}.md and .json (private)\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
