import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkSkill, reportHash, type RedlineReport } from "@countersign/redline";
import {
  hashSkillFiles,
  MANIFEST_FILE,
  ManifestError,
  parseManifest,
  readSkillDir,
  type ContentHash,
  type ParsedManifest,
  type SkillFile,
} from "@countersign/core";
import type { Hex } from "viem";

export interface LoadedSkill {
  dir: string;
  files: SkillFile[];
  content: ContentHash;
  manifest: ParsedManifest | null;
  manifestProblem: string | null;
  redline: RedlineReport;
  redlineHash: Hex;
}

export async function loadSkill(dir: string, opts: { extraKnown?: string[]; checkerCommit?: string | null } = {}): Promise<LoadedSkill> {
  const files = await readSkillDir(dir);
  const content = hashSkillFiles(files);
  let manifest: ParsedManifest | null = null;
  let manifestProblem: string | null = null;
  try {
    manifest = parseManifest(JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8")));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    manifestProblem =
      err.code === "ENOENT"
        ? `this skill has no ${MANIFEST_FILE}, so it declares no permissions`
        : e instanceof ManifestError
          ? e.message
          : `${MANIFEST_FILE} is not valid JSON: ${err.message}`;
  }
  const redline = checkSkill(files, { extraKnown: opts.extraKnown, checkerCommit: opts.checkerCommit ?? null });
  return { dir, files, content, manifest, manifestProblem, redline, redlineHash: reportHash(redline) };
}
