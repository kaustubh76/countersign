import { bool, parseArgs, type Args } from "./args.js";
import { cmdEndorse, cmdHash, cmdManifest, cmdRedline, cmdRegister } from "./author.js";
import { cmdCheckCall, cmdCheckInstall, cmdCheckPreview, cmdCountersign, cmdReport, cmdSession, cmdStatus } from "./user.js";
import { UsageError } from "./context.js";
import { print, type Result } from "./output.js";

const COMMANDS: Record<string, (args: Args) => Promise<Result>> = {
  hash: cmdHash,
  manifest: cmdManifest,
  redline: cmdRedline,
  register: cmdRegister,
  endorse: cmdEndorse,
  "check-install": cmdCheckInstall,
  "check-call": cmdCheckCall,
  "check-preview": cmdCheckPreview,
  session: cmdSession,
  countersign: cmdCountersign,
  report: cmdReport,
  status: cmdStatus,
};

const HELP = `countersign: proof-of-use trust for agent skills (BNB Smart Chain)

User commands (run inside the user's agent, next to the Agentic Wallet skill)
  check-install <skill-dir>                before installing or first using a skill: allow / warn / block
  check-call --skill <dir> --to <a> --data <hex> [--value <wei>] [--from <wallet>]
                                           before every \`baw contract-call preview\`: is the call declared?
  check-preview --skill <dir> --preview <file|-|json>
                                           after preview: do Binance's simulated effects match the manifest?
  session start --skill <dir> --wallet <a> | record <txHash> [--builtin] | status | end | clear
                                           prove a clean session, then offer a countersign (or a report)
  status <versionId | skill-dir>           verified counts and incidents for a version
  countersign | report <versionId> <txHash>... --from <wallet>     manual calldata (simulated first)

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
  --verify-local         verify from chain data here instead of asking the COUNTERSIGN API
  --no-content           skip fetching published content (C1 / static incidents) when verifying locally

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
