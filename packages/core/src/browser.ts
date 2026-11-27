/**
 * Browser-safe entry point, "@countersign/core/browser": only the pure modules (no node:fs, node:path or
 * node:zlib). The web app's client components import from here: the in-browser verifier playground, the
 * local-folder Red-Line Check and the manifest builder. Node code can keep using "@countersign/core",
 * which re-exports all of this too.
 */
export * from "./constants.js";
export * from "./manifest.js";
export * from "./skillHash.js";
export * from "./verifier.js";
// Type-only (erased at build), so the views module and its ABI never reach a browser bundle.
export type { AttestationView, OnchainTarget, RecordView, VersionView } from "./views.js";
