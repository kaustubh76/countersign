/** Public URLs and the install command, shared by every page. Override with NEXT_PUBLIC_* at build. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://countersign-proof.vercel.app").replace(/\/+$/, "");
export const REPO_URL = (process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/kaustubh76/countersign").replace(/\/+$/, "");
/** The commit this build came from (Vercel git deploys and local builds); empty when unknown. */
export const COMMIT_SHA = (process.env.NEXT_PUBLIC_COMMIT_SHA ?? "").trim();
export const INSTALL_CMD = `npx skills add ${REPO_URL} --skill countersign`;
export const RULESET = "countersign.ruleset/v1";
export const bscscan = (kind: "address" | "tx", id: string) => `https://bscscan.com/${kind}/${id}`;
export const short = (h: string, a = 6, b = 4) => (h.length > a + b + 2 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
