/** Minimal argv parser: positionals plus --flag value / --flag=value / --bool. */
export interface Args {
  positionals: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: readonly string[]): Args {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    positionals.push(a);
  }
  return { positionals, flags };
}

export function flag(args: Args, name: string): string | undefined {
  const v = args.flags.get(name);
  return typeof v === "string" ? v : undefined;
}

export function bool(args: Args, name: string): boolean {
  return args.flags.has(name) && args.flags.get(name) !== "false";
}

export function list(args: Args, name: string): string[] {
  const v = flag(args, name);
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
