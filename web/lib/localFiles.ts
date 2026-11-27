import { isExcludedPath, normalizeSkillPath, type SkillFile } from "@countersign/core/browser";

/** Reading a skill folder chosen or dropped in the browser. Nothing leaves the page. */

export const LIMITS = { files: 2_000, totalBytes: 25 * 1024 * 1024, fileBytes: 5 * 1024 * 1024 };

export class LocalFolderError extends Error {}

/** Paths come in as "<folder>/<path>"; the folder itself is the skill root, so drop the first segment. */
function relative(path: string): string {
  const parts = path.replace(/^\/+/, "").split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : parts[0]!;
}

async function toSkillFiles(entries: { path: string; file: File }[]): Promise<SkillFile[]> {
  const kept = entries.filter((e) => !isExcludedPath(e.path));
  if (kept.length === 0) throw new LocalFolderError("no files found in that folder");
  if (kept.length > LIMITS.files) throw new LocalFolderError(`too many files (${kept.length}); the browser check takes up to ${LIMITS.files}`);
  const total = kept.reduce((n, e) => n + e.file.size, 0);
  if (total > LIMITS.totalBytes) throw new LocalFolderError("folder is larger than 25 MB; run the CLI instead");
  const big = kept.find((e) => e.file.size > LIMITS.fileBytes);
  if (big) throw new LocalFolderError(`${big.path} is larger than 5 MB; run the CLI instead`);
  return Promise.all(kept.map(async (e) => ({ path: normalizeSkillPath(e.path), bytes: new Uint8Array(await e.file.arrayBuffer()) })));
}

/** From <input type="file" webkitdirectory>. */
export function filesFromInput(list: FileList): Promise<SkillFile[]> {
  const entries = Array.from(list).map((file) => ({ path: relative(file.webkitRelativePath || file.name), file }));
  return toSkillFiles(entries);
}

type Entry = FileSystemEntry;
const isDir = (e: Entry): e is FileSystemDirectoryEntry => e.isDirectory;
const isFile = (e: Entry): e is FileSystemFileEntry => e.isFile;

async function walk(entry: Entry, out: { path: string; file: File }[]): Promise<void> {
  if (isFile(entry)) {
    const file = await new Promise<File>((res, rej) => entry.file(res, rej));
    out.push({ path: relative(entry.fullPath), file });
  } else if (isDir(entry)) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<Entry[]>((res, rej) => reader.readEntries(res, rej));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** From a drag-and-drop of one folder (or of loose files, treated as the skill root). */
export async function filesFromDrop(items: DataTransferItemList): Promise<SkillFile[]> {
  const roots = Array.from(items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is Entry => Boolean(e));
  if (roots.length === 0) throw new LocalFolderError("drop a folder (your skill's root, the one with SKILL.md)");
  const out: { path: string; file: File }[] = [];
  if (roots.length === 1 && isDir(roots[0]!)) await walk(roots[0]!, out);
  else for (const r of roots) await walk(r, out).then(() => undefined);
  // loose files: their fullPath is "/name", which relative() keeps as "name"
  return toSkillFiles(out);
}
