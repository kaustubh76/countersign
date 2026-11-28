import type { Hex } from "viem";
import { loadSnapshot, verifySnapshot, type SkillFile, type VersionReport } from "@countersign/core";
import { checkSkill } from "@countersign/redline";
import type { Context } from "./context.js";

/** Static I3 check used by the verifier: which red-line rules the content fails. */
export function staticCheck(files: SkillFile[]): { failedRules: string[] } {
  return { failedRules: checkSkill(files).results.filter((r) => !r.passed).map((r) => r.rule) };
}

function reviveBigints(report: VersionReport): VersionReport {
  return { ...report, computedAtBlock: report.computedAtBlock == null ? null : BigInt(report.computedAtBlock) };
}

/**
 * The verified status of a version. It asks the public API first (a cache) and falls back to verifying
 * from chain data locally, which needs no trust in COUNTERSIGN's servers. `local` forces the second path.
 */
export async function versionStatus(
  ctx: Context,
  versionId: Hex,
  opts: { local?: boolean; noContent?: boolean } = {},
): Promise<{ report: VersionReport | null; source: "api" | "local" }> {
  if (!opts.local) {
    try {
      const res = await fetch(`${ctx.apiBase.replace(/\/$/, "")}/api/v1/version/${versionId}?chainId=${ctx.chainId}`, {
        signal: AbortSignal.timeout(6_000),
      });
      if (res.status === 404) return { report: null, source: "api" };
      if (res.ok) {
        const body = (await res.json()) as { report?: VersionReport };
        if (body.report && body.report.versionId?.toLowerCase() === versionId.toLowerCase()) {
          return { report: reviveBigints(body.report), source: "api" };
        }
      }
    } catch {
      // API unreachable: verify locally instead
    }
  }
  const snap = await loadSnapshot(ctx.reader, ctx.deployment);
  const key = [...snap.versions.keys()].find((k) => k.toLowerCase() === versionId.toLowerCase());
  if (!key) return { report: null, source: "local" };
  // The whole registry is verified (W1 "established" needs it); only this version's content is fetched.
  const reports = await verifySnapshot(snap, ctx.chainId, ctx.reader, {
    staticCheck,
    contentFor: key,
    ...(opts.noContent ? { fetchContent: false as const } : {}),
  });
  return { report: reports.get(key) ?? null, source: "local" };
}
