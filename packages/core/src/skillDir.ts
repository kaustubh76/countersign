import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { EXCLUDED_DIRS, EXCLUDED_FILES, hashSkillFiles, SkillHashError, type ContentHash, type SkillFile } from "./skillHash.js";

/** Reading a skill folder from disk (Node only). The hash itself is in skillHash.ts. */

/** Read every file under `root` (following a symlinked root, rejecting symlinks inside it). */
export async function readSkillDir(root: string): Promise<SkillFile[]> {
  const base = await realpath(root);
  if (!(await stat(base)).isDirectory()) throw new SkillHashError(`not a directory: ${root}`);
  const out: SkillFile[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(base, abs);
      if (entry.isSymbolicLink()) throw new SkillHashError(`symlinks are not allowed inside a skill: ${rel}`);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) await walk(abs);
        continue;
      }
      if (entry.isFile()) {
        if (!EXCLUDED_FILES.has(entry.name)) out.push({ path: rel, bytes: new Uint8Array(await readFile(abs)) });
        continue;
      }
      throw new SkillHashError(`unsupported file type inside a skill: ${rel}`);
    }
  }
  await walk(base);
  return out;
}

export async function hashSkillDir(root: string): Promise<ContentHash> {
  return hashSkillFiles(await readSkillDir(root));
}
