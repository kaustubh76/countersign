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
 *
 * Everything in this module is pure and also runs in a browser. Reading a folder from disk is in
 * skillDir.ts (Node only).
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
  const posix = path.replace(/\\/g, "/");
  const normalized = posix.normalize("NFC").replace(/^\.\//, "");
  if (normalized === "" || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new SkillHashError(`invalid path in skill: ${JSON.stringify(path)}`);
  }
  return normalized;
}

/** True for paths the content hash always skips: anything under .git/ or node_modules/, and .DS_Store. */
export function isExcludedPath(path: string): boolean {
  const parts = path.split("/");
  const base = parts[parts.length - 1] ?? "";
  return parts.slice(0, -1).some((p) => EXCLUDED_DIRS.has(p)) || EXCLUDED_DIRS.has(base) || EXCLUDED_FILES.has(base);
}

const utf8 = new TextEncoder();

/** Byte-wise comparison of the UTF-8 encodings (the same order as Node's Buffer.compare). */
function compareUtf8(a: string, b: string): number {
  const x = utf8.encode(a);
  const y = utf8.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

/** Hash an in-memory file list. The verifier uses this on content fetched from contentURI. */
export function hashSkillFiles(input: readonly SkillFile[]): ContentHash {
  const seen = new Map<string, string>();
  const files: { path: string; bytes: Uint8Array }[] = [];
  for (const f of input) {
    const path = normalizeSkillPath(f.path);
    if (isExcludedPath(path)) continue;
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
