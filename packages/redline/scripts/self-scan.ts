/** Prints every finding the Red-Line engine reports on its own source and on the bundled skill. */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSkill } from "../src/check.js";

const here = dirname(fileURLToPath(import.meta.url));
const enc = new TextEncoder();
async function readDir(dir: string, rel = ""): Promise<{ path: string; bytes: Uint8Array }[]> {
  const out: { path: string; bytes: Uint8Array }[] = [];
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await readDir(dir, p)));
    else out.push({ path: p, bytes: new Uint8Array(await readFile(join(dir, p))) });
  }
  return out;
}
const target = process.argv[2] ? resolve(process.argv[2]) : resolve(here, "../src");
const files = await readDir(target);
if (!files.some((f) => /SKILL\.md$/.test(f.path))) files.push({ path: "SKILL.md", bytes: enc.encode("---\nname: self\n---\n") });
const report = checkSkill(files);
let n = 0;
for (const r of report.results)
  for (const f of r.findings) {
    n++;
    console.log(`${f.rule} ${f.severity} ${f.file}:${f.line} | ${f.message} | ${f.snippet.slice(0, 140)}`);
  }
console.log(`${n} findings in ${target}`);
