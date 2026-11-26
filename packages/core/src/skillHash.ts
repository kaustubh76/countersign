import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { concat, keccak256, toBytes, type Hex } from "viem";
import { CONTENT_HASH_DOMAIN } from "./constants.js";

/**
 * Content hash of a skill folder. The full spec is in docs/skill-hash-spec.md:
 *
 *   files      every regular file under the root, recursively, except the fixed excludes below
 *   path       relative to the root, '/'-separated, Unicode NFC
 *   order      ascending by the UTF-8 bytes of the path
 *   hash       keccak256( utf8(DOMAIN) ‖ for each file: keccak256(utf8(path)) ‖ keccak256(bytes) )
 *
 * Excludes are fixed and cannot be configured: an ignore file would let an author hide executable code
 * from the hash. Symlinks inside the tree are rejected, because their content depends on the machine.
 */

export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([".git", "node_modules"]);
export const EXCLUDED_FILES: ReadonlySet<string> = new Set([".DS_Store"]);

export interface SkillFile {
  path: string;
  bytes: Uint8Array;
}

export interface HashedFile {
  path: string;
  size: number;
  hash: Hex;
}

export interface ContentHash {
  contentHash: Hex;
  files: HashedFile[];
}

export class SkillHashError extends Error {
  override name = "SkillHashError";
}

export function normalizeSkillPath(path: string): string {
  const posix = path.split(sep).join("/").replace(/\\/g, "/");
  const normalized = posix.normalize("NFC").replace(/^\.\//, "");
  if (normalized === "" || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new SkillHashError(`invalid path in skill: ${JSON.stringify(path)}`);
  }
  return normalized;
}

function isExcluded(path: string): boolean {
  const parts = path.split("/");
  const base = parts[parts.length - 1] ?? "";
  return parts.slice(0, -1).some((p) => EXCLUDED_DIRS.has(p)) || EXCLUDED_DIRS.has(base) || EXCLUDED_FILES.has(base);
}

function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Hash an in-memory file list. The verifier uses this on content fetched from contentURI. */
export function hashSkillFiles(input: readonly SkillFile[]): ContentHash {
  const seen = new Map<string, string>();
  const files: { path: string; bytes: Uint8Array }[] = [];
  for (const f of input) {
    const path = normalizeSkillPath(f.path);
    if (isExcluded(path)) continue;
    const previous = seen.get(path);
    if (previous !== undefined) {
      throw new SkillHashError(`two files normalize to the same path ${JSON.stringify(path)} (${previous}, ${f.path})`);
    }
    seen.set(path, f.path);
    files.push({ path, bytes: f.bytes });
  }
  if (files.length === 0) throw new SkillHashError("skill has no files");
  files.sort((a, b) => compareUtf8(a.path, b.path));

  const parts: Uint8Array[] = [toBytes(CONTENT_HASH_DOMAIN)];
  const hashed: HashedFile[] = [];
  for (const f of files) {
    const fileHash = keccak256(f.bytes);
    parts.push(keccak256(toBytes(f.path), "bytes"), toBytes(fileHash));
    hashed.push({ path: f.path, size: f.bytes.length, hash: fileHash });
  }
  return { contentHash: keccak256(concat(parts)), files: hashed };
}

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
