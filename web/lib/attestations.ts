import type { Hex } from "viem";
import { reportHash, type RedlineReport } from "@countersign/redline";
import { SITE_URL } from "./site";

/**
 * A published Red-Line report (web/public/attestations/<chainId>/<versionId>.json, written by `pnpm attest`).
 * Its hash is recomputed here, so the page can say whether it is the report the attestation points at.
 */
export interface PublishedReport {
  url: string;
  hash: Hex;
  checkerCommit: string;
  contracts: number;
}

export async function publishedReport(chainId: number, versionId: string): Promise<PublishedReport | null> {
  const url = `/attestations/${chainId}/${versionId.toLowerCase()}.json`;
  try {
    const res = await fetch(`${SITE_URL}${url}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const doc = (await res.json()) as { report?: RedlineReport; checkerCommit?: string };
    if (!doc.report) return null;
    return { url, hash: reportHash(doc.report), checkerCommit: doc.checkerCommit ?? "", contracts: doc.report.input.contracts?.length ?? 0 };
  } catch {
    return null;
  }
}
