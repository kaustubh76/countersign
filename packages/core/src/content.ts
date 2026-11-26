import { gunzipSync } from "node:zlib";
import type { SkillFile } from "./skillHash.js";

/**
 * Fetch a registered skill's files from its contentURI, so a verifier can re-hash them (rule C1).
 * Supported: GitHub tree URLs pinned to a commit, https://github.com/<owner>/<repo>/tree/<commit>[/<path>].
 * The repository tarball for that commit comes from codeload.github.com; only files under <path> are kept.
 */

export interface GithubRef {
  owner: string;
  repo: string;
  commit: string;
  path: string;
}

const TREE_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/tree\/([0-9a-fA-F]{7,40})(?:\/(.*?))?\/?$/;

export function parseGithubTreeUrl(uri: string): GithubRef | null {
  const m = TREE_RE.exec(uri.trim());
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, commit: m[3]!, path: decodeURIComponent(m[4] ?? "") };
}

function cString(buf: Uint8Array, start: number, length: number): string {
  let end = start;
  while (end < start + length && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(start, end));
}

function parseOctal(buf: Uint8Array, start: number, length: number): number {
  const s = cString(buf, start, length).trim();
  return s ? Number.parseInt(s, 8) : 0;
}

function parsePax(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const text = new TextDecoder().decode(data);
  let i = 0;
  while (i < text.length) {
    const space = text.indexOf(" ", i);
    if (space === -1) break;
    const len = Number.parseInt(text.slice(i, space), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = text.slice(space + 1, i + len - 1);
    const eq = record.indexOf("=");
    if (eq !== -1) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

export interface TarEntry {
  path: string;
  type: "file" | "dir" | "symlink" | "other";
  bytes: Uint8Array;
}

/** Minimal ustar/pax reader (enough for GitHub tarballs). */
export function readTar(tar: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let paxPath: string | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = cString(header, 0, 100);
    const size = parseOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const prefix = cString(header, 345, 155);
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (typeflag === "x") {
      paxPath = parsePax(data).path;
      continue;
    }
    if (typeflag === "g" || typeflag === "L" || typeflag === "K") {
      if (typeflag === "L") paxPath = cString(data, 0, data.length);
      continue;
    }
    const path = paxPath ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = undefined;
    const type =
      typeflag === "0" || typeflag === "\0" || typeflag === "7"
        ? "file"
        : typeflag === "5"
          ? "dir"
          : typeflag === "2" || typeflag === "1"
            ? "symlink"
            : "other";
    entries.push({ path, type, bytes: type === "file" ? new Uint8Array(data) : new Uint8Array() });
  }
  return entries;
}

export class ContentFetchError extends Error {
  override name = "ContentFetchError";
}

/** Extract the skill folder's files from a GitHub tarball (top-level "<repo>-<sha>/" stripped). */
export function skillFilesFromTarball(gz: Uint8Array, path: string): SkillFile[] {
  const entries = readTar(gunzipSync(gz));
  const prefix = path ? `${path.replace(/^\/+|\/+$/g, "")}/` : "";
  const files: SkillFile[] = [];
  for (const e of entries) {
    const rel = e.path.split("/").slice(1).join("/"); // strip "<repo>-<sha>/"
    if (!rel.startsWith(prefix) || rel === prefix) continue;
    const inner = rel.slice(prefix.length);
    if (!inner) continue;
    if (e.type === "symlink") throw new ContentFetchError(`symlink inside the skill: ${inner}`);
    if (e.type === "file") files.push({ path: inner, bytes: e.bytes });
  }
  if (files.length === 0) throw new ContentFetchError(`no files under "${path}" in the tarball`);
  return files;
}

export async function fetchGithubSkill(uri: string, fetchImpl: typeof fetch = fetch): Promise<SkillFile[]> {
  const ref = parseGithubTreeUrl(uri);
  if (!ref) throw new ContentFetchError(`unsupported contentURI (need a GitHub tree URL pinned to a commit): ${uri}`);
  const url = `https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/${ref.commit}`;
  const res = await fetchImpl(url, { redirect: "follow" });
  if (!res.ok) throw new ContentFetchError(`GET ${url} → ${res.status}`);
  const gz = new Uint8Array(await res.arrayBuffer());
  if (gz.length > 50 * 1024 * 1024) throw new ContentFetchError("repository tarball larger than 50 MB");
  return skillFilesFromTarball(gz, ref.path);
}
