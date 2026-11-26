// Bundles the companion CLI into the skill folder as one dependency-free, unminified file.
// The output is deterministic: CI rebuilds it and fails if the committed file differs.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(here, "../../../skills/countersign/scripts/countersign.mjs");

await build({
  entryPoints: [resolve(here, "../src/cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  minify: false,
  sourcemap: false,
  legalComments: "eof",
  charset: "utf8",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "// COUNTERSIGN companion CLI: bundled from packages/companion in the COUNTERSIGN repository (MIT).",
      "// Do not edit. Rebuild with `pnpm build:skill`; the build is reproducible and checked in CI.",
      "// It never signs or sends transactions: it prints `baw contract-call preview` commands for the agent.",
      'import { createRequire as __countersignCreateRequire } from "node:module";',
      "const require = __countersignCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "warning",
});
console.log(`wrote ${outfile}`);
