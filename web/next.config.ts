import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

/** The commit being built: Vercel git deploys set VERCEL_GIT_COMMIT_SHA; local builds ask git. */
function commitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { cwd: here, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const config: NextConfig = {
  // Workspace packages ship TypeScript source with ESM-style ".js" import specifiers.
  transpilePackages: ["@countersign/core", "@countersign/redline"],
  // The monorepo root, so file tracing (and Vercel) include the workspace packages.
  outputFileTracingRoot: resolve(here, ".."),
  // The share-card fonts are read from disk (web/assets/og) by the opengraph-image routes.
  outputFileTracingIncludes: { "/**/opengraph-image": ["./assets/og/*"] },
  env: { NEXT_PUBLIC_COMMIT_SHA: commitSha() },
  poweredByHeader: false,
  reactStrictMode: true,
  webpack(cfg) {
    cfg.resolve ??= {};
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return cfg;
  },
  // A short link to the landing page playing itself (the demo video, outreach).
  async redirects() {
    return [{ source: "/watch", destination: "/?watch=1", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default config;
