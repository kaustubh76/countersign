import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentFetchError, fetchGithubSkill, parseGithubTreeUrl, skillFilesFromTarball } from "../src/content.js";
import { hashSkillDir, hashSkillFiles } from "../src/skillHash.js";

describe("parseGithubTreeUrl", () => {
  it("accepts commit-pinned tree URLs only", () => {
    expect(parseGithubTreeUrl("https://github.com/acme/skills/tree/0123abc/skills/demo")).toEqual({
      owner: "acme",
      repo: "skills",
      commit: "0123abc",
      path: "skills/demo",
    });
    expect(parseGithubTreeUrl("https://github.com/acme/skills/tree/0123abcd")?.path).toBe("");
    expect(parseGithubTreeUrl("https://github.com/acme/skills/tree/main/skills/demo")).toBeNull(); // branch, not a commit
    expect(parseGithubTreeUrl("https://gitlab.com/acme/skills/tree/0123abc")).toBeNull();
  });
});

// GitHub's codeload tarballs are `git archive` output, so build one the same way.
describe("skillFilesFromTarball (git archive, like GitHub)", () => {
  let repo: string;
  let gz: Uint8Array;
  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "cs-repo-"));
    const git = (...a: string[]) => execFileSync("git", ["-C", repo, ...a], { stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    await mkdir(join(repo, "skills", "demo", "scripts"), { recursive: true });
    await writeFile(join(repo, "README.md"), "outside the skill");
    await writeFile(join(repo, "skills", "demo", "SKILL.md"), "# demo\n");
    await writeFile(join(repo, "skills", "demo", "scripts", "run.mjs"), "console.log(1)\n");
    const long = "a".repeat(120); // forces a pax path header
    await writeFile(join(repo, "skills", "demo", `${long}.md`), "long name");
    git("add", "-A");
    git("commit", "-q", "-m", "init");
    const sha = git("rev-parse", "HEAD").toString().trim();
    const out = join(repo, "archive.tar.gz");
    execFileSync("git", ["-C", repo, "archive", "--format=tar.gz", `--prefix=skills-${sha}/`, "-o", out, "HEAD"]);
    gz = new Uint8Array(await readFile(out));
  });
  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("extracts exactly the skill folder and hashes like the local directory", async () => {
    const files = skillFilesFromTarball(gz, "skills/demo");
    expect(files.map((f) => f.path).sort()).toEqual([`${"a".repeat(120)}.md`, "SKILL.md", "scripts/run.mjs"].sort());
    expect(hashSkillFiles(files).contentHash).toBe((await hashSkillDir(join(repo, "skills", "demo"))).contentHash);
  });

  it("fails clearly when the path does not exist", () => {
    expect(() => skillFilesFromTarball(gz, "skills/nope")).toThrow(ContentFetchError);
  });

  it("fetchGithubSkill downloads from codeload for the pinned commit", async () => {
    const seen: string[] = [];
    const fakeFetch = (async (url: string) => {
      seen.push(url);
      return new Response(gz);
    }) as unknown as typeof fetch;
    const files = await fetchGithubSkill("https://github.com/acme/skills/tree/0123abcd/skills/demo", fakeFetch);
    expect(seen).toEqual(["https://codeload.github.com/acme/skills/tar.gz/0123abcd"]);
    expect(files).toHaveLength(3);
  });
});
