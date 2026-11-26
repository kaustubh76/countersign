import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // Workspace packages ship TypeScript source with ESM-style ".js" import specifiers.
  transpilePackages: ["@countersign/core", "@countersign/redline"],
  // The monorepo root, so file tracing (and Vercel) include the workspace packages.
  outputFileTracingRoot: resolve(here, ".."),
  poweredByHeader: false,
  reactStrictMode: true,
  webpack(cfg) {
    cfg.resolve ??= {};
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return cfg;
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
