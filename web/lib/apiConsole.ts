/**
 * The /docs API console: real requests to the live API, shown like a terminal. These are its pure parts
 * (paths, the equivalent curl, JSON tinting, what changed since the last send), kept apart for tests.
 */

export interface ApiEndpoint {
  method: "GET" | "POST";
  /** Display path; `<id>` is filled from `param`. */
  path: string;
  desc: string;
  /** Default value for `<id>`. */
  param?: string;
  /** Default JSON body for a POST. */
  body?: string;
}

/** The request path with `<id>` filled in (trimmed, URL-encoded). */
export function fillPath(path: string, param = ""): string {
  return path.replace("<id>", encodeURIComponent(param.trim()));
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The same request as a one-line curl. JSON bodies are minified; anything else is sent as typed. */
export function curlOf(site: string, ep: ApiEndpoint, param = "", body = ""): string {
  const url = `${site}${fillPath(ep.path, param)}`;
  const target = /^[\w\-.:/%~]+$/.test(url) ? url : shellQuote(url);
  if (ep.method === "GET") return `curl -s ${target}`;
  let data = body.trim();
  try {
    data = JSON.stringify(JSON.parse(data));
  } catch {
    // not JSON: send exactly what they typed (the API will say what's wrong)
  }
  return `curl -s -X POST ${target} -H 'content-type: application/json' -d ${shellQuote(data)}`;
}

/** Pretty-printed JSON, or null when the text isn't JSON. */
export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

/** k: key, s: string, n: number, l: true/false/null, p: punctuation and spaces. */
export type TokKind = "k" | "s" | "n" | "l" | "p";
export interface Tok {
  k: TokKind;
  v: string;
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** One line of pretty JSON as tinted tokens. Joining the values gives back the exact line. */
export function jsonTokens(line: string): Tok[] {
  const out: Tok[] = [];
  const push = (k: TokKind, v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (k === "p" && prev?.k === "p") prev.v += v;
    else out.push({ k, v });
  };
  let at = 0;
  for (const m of line.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    push("p", line.slice(at, i));
    if (m[1] !== undefined) {
      push(m[2] !== undefined ? "k" : "s", m[1]);
      push("p", m[2] ?? "");
    } else if (m[3] !== undefined) push("n", m[3]);
    else push("l", m[4] ?? "");
    at = i + m[0].length;
  }
  push("p", line.slice(at));
  return out;
}

/** Indexes of the lines that differ from the previous response to the same request. */
export function changedLines(prev: readonly string[] | null | undefined, next: readonly string[]): Set<number> {
  const out = new Set<number>();
  if (!prev) return out;
  next.forEach((line, i) => {
    if (prev[i] !== line) out.add(i);
  });
  return out;
}

const STATUS: Record<number, string> = {
  200: "OK",
  400: "Bad request",
  404: "Not found",
  422: "Unprocessable",
  429: "Too many",
  500: "Server error",
  502: "Bad gateway",
  503: "Unavailable",
  504: "Timeout",
};

/** "200 OK": HTTP/2 responses carry no status text, so the console names the common ones itself. */
export function statusLabel(code: number): string {
  return `${code} ${STATUS[code] ?? ""}`.trim();
}

export function statusKind(code: number): "ok" | "warn" | "bad" {
  if (code >= 200 && code < 300) return "ok";
  return code >= 500 || code === 0 ? "bad" : "warn";
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
}
