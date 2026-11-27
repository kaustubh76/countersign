import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashSkillDir } from "../src/skillDir.js";
import { hashSkillFiles, SkillHashError } from "../src/skillHash.js";

const enc = new TextEncoder();
const file = (path: string, text: string) => ({ path, bytes: enc.encode(text) });

// Computed independently with `cast` from the spec formula (see docs/skill-hash-spec.md):
// keccak( utf8("countersign.skill.v1") ‖ keccak("SKILL.md") ‖ keccak("# demo") ‖ keccak("scripts/run.mjs") ‖ keccak("console.log(1)") )
const VECTOR = "0x0f1efb83ddd01f01bc3bcbac6a62a26c3357bfc30390fae5b72534085d71d82d";

describe("hashSkillFiles", () => {
  it("matches the independently computed spec vector", () => {
    const { contentHash, files } = hashSkillFiles([file("scripts/run.mjs", "console.log(1)"), file("SKILL.md", "# demo")]);
    expect(contentHash).toBe(VECTOR);
    expect(files.map((f) => f.path)).toEqual(["SKILL.md", "scripts/run.mjs"]);
  });

  it("is independent of input order and path separators", () => {
    const a = hashSkillFiles([file("SKILL.md", "# demo"), file("scripts/run.mjs", "console.log(1)")]);
    const b = hashSkillFiles([file("./scripts/run.mjs", "console.log(1)"), file("SKILL.md", "# demo")]);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("changes when any byte, any name, or any file changes", () => {
    const base = hashSkillFiles([file("SKILL.md", "# demo")]).contentHash;
    expect(hashSkillFiles([file("SKILL.md", "# demo ")]).contentHash).not.toBe(base);
    expect(hashSkillFiles([file("skill.md", "# demo")]).contentHash).not.toBe(base);
    expect(hashSkillFiles([file("SKILL.md", "# demo"), file("x", "")]).contentHash).not.toBe(base);
  });

  it("normalizes Unicode to NFC", () => {
    const nfc = hashSkillFiles([file("café.md", "x")]).contentHash;
    const nfd = hashSkillFiles([file("café.md", "x")]).contentHash;
    expect(nfd).toBe(nfc);
  });

  it("drops the fixed excludes and nothing else", () => {
    const base = hashSkillFiles([file("SKILL.md", "# demo")]).contentHash;
    const withJunk = hashSkillFiles([
      file("SKILL.md", "# demo"),
      file(".git/HEAD", "ref"),
      file("node_modules/x/index.js", "1"),
      file("sub/.DS_Store", "junk"),
    ]).contentHash;
    expect(withJunk).toBe(base);
    // dotfiles that are not excluded are hashed (an ignore list could hide code)
    expect(hashSkillFiles([file("SKILL.md", "# demo"), file(".env.example", "A=1")]).contentHash).not.toBe(base);
  });

  it("rejects empty skills, traversal and colliding paths", () => {
    expect(() => hashSkillFiles([])).toThrow(SkillHashError);
    expect(() => hashSkillFiles([file("../evil", "x")])).toThrow(SkillHashError);
    expect(() => hashSkillFiles([file("/abs", "x")])).toThrow(SkillHashError);
    expect(() => hashSkillFiles([file("café", "1"), file("café", "2")])).toThrow(/same path/);
  });
});

describe("hashSkillDir", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cs-skill-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("equals hashSkillFiles over the same content", async () => {
    await writeFile(join(dir, "SKILL.md"), "# demo");
    await mkdir(join(dir, "scripts"));
    await writeFile(join(dir, "scripts", "run.mjs"), "console.log(1)");
    await mkdir(join(dir, ".git"));
    await writeFile(join(dir, ".git", "HEAD"), "ignored");
    const { contentHash } = await hashSkillDir(dir);
    expect(contentHash).toBe(VECTOR);
  });

  it("rejects symlinks inside the skill", async () => {
    await writeFile(join(dir, "SKILL.md"), "# demo");
    await symlink(join(dir, "SKILL.md"), join(dir, "link.md"));
    await expect(hashSkillDir(dir)).rejects.toThrow(/symlinks are not allowed/);
  });

  it("follows a symlinked skill root (skills installers often symlink)", async () => {
    const real = join(dir, "real");
    await mkdir(real);
    await writeFile(join(real, "SKILL.md"), "# demo");
    await mkdir(join(real, "scripts"));
    await writeFile(join(real, "scripts", "run.mjs"), "console.log(1)");
    await symlink(real, join(dir, "linked"));
    expect((await hashSkillDir(join(dir, "linked"))).contentHash).toBe(VECTOR);
  });
});
