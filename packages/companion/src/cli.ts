import { bool, parseArgs, type Args } from "./args.js";
import { cmdEndorse, cmdHash, cmdManifest, cmdRedline, cmdRegister } from "./author.js";
import { UsageError } from "./context.js";
import { print, type Result } from "./output.js";

const COMMANDS: Record<string, (args: Args) => Promise<Result>> = {
  hash: cmdHash,
  manifest: cmdManifest,
  redline: cmdRedline,
  register: cmdRegister,
  endorse: cmdEndorse,
};

const HELP = `countersign: proof-of-use trust for agent skills (BNB Smart Chain)

Author commands
  hash <skill-dir>                         content hash + file list
  manifest <skill-dir>                     validate countersign.json, show the on-chain form
  redline <skill-dir>                      static Red-Line Check (+ report hash)
  register <skill-dir> --uri <url>         check, simulate, and print the baw preview command
  endorse <versionId> <targetIndex>        calldata for the anchor's owner

Common flags
  --json                 machine-readable output (agents should always pass it)
  --deployment <file>    contracts/deployments/<chainId>.json (default: built-in mainnet addresses)
  --rpc <url[,url]>      RPC endpoints (default: public BSC endpoints with fallback)

This tool never signs or sends anything. Every on-chain step is a \`baw contract-call preview\` command for
the agent to run, followed by an explicit "yes" from the user before \`baw contract-call execute\`.
`;

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const json = bool(args, "json");
  const name = args.positionals[0];
  if (!name || name === "help" || bool(args, "help")) {
    process.stdout.write(HELP);
    return 0;
  }
  const fn = COMMANDS[name];
  if (!fn) {
    print({ ok: false, command: name, say: `Unknown command "${name}". Run: countersign help` }, json);
    return 2;
  }
  try {
    const result = await fn(args);
    print(result, json);
    return result.ok ? 0 : 1;
  } catch (e) {
    print({ ok: false, command: name, say: (e as Error).message }, json);
    return e instanceof UsageError ? 2 : 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`${(e as Error)?.stack ?? String(e)}\n`);
    process.exit(1);
  },
);
