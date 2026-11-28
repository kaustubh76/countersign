"use client";

import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Stamp } from "@/components/Stamp";
import { changedLines, curlOf, fillPath, fmtBytes, jsonTokens, prettyJson, statusKind, statusLabel, type ApiEndpoint } from "@/lib/apiConsole";
import { prefersReducedMotion } from "@/lib/motion";

/** Long responses (a full Red-Line report) are cut here; the curl gets all of it. */
const MAX_LINES = 400;

interface Shown {
  /** Bumped per response, so the changed lines flash again. */
  seq: number;
  ep: number;
  /** 0 when there was no response at all. */
  status: number;
  /** null for the copy that came with the page (not a live request). */
  ms: number | null;
  bytes: number;
  cache: string | null;
  json: boolean;
  lines: string[];
  more: number;
  svg: string | null;
  changed: Set<number>;
}

function linesOf(text: string, json: boolean): { lines: string[]; more: number } {
  const all = (json ? (prettyJson(text) ?? text) : text).split("\n");
  return { lines: all.slice(0, MAX_LINES), more: Math.max(0, all.length - MAX_LINES) };
}

const keyOf = (ep: ApiEndpoint, param: string, body: string) => `${ep.method} ${fillPath(ep.path, param)} ${ep.method === "POST" ? body.trim() : ""}`;

/**
 * The API, live: pick an endpoint and the page sends the real request from your browser and shows the
 * real response (status, time, size, cache). `initial` is the /chain response the page was rendered with.
 */
export function ApiConsole({ endpoints, site, initial }: { endpoints: ApiEndpoint[]; site: string; initial: string | null }) {
  const [sel, setSel] = useState(0);
  const [params, setParams] = useState(() => endpoints.map((e) => e.param ?? ""));
  const [bodies, setBodies] = useState(() => endpoints.map((e) => e.body ?? ""));
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(() =>
    initial
      ? { seq: 0, ep: 0, status: 200, ms: null, bytes: new TextEncoder().encode(initial).length, cache: null, json: true, ...linesOf(initial, true), svg: null, changed: new Set() }
      : null,
  );
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const inflight = useRef<AbortController | null>(null);
  /** The last lines seen per request, for "what changed"; the page's own copy seeds /chain. */
  const seen = useRef(new Map<string, string[]>());
  const pageCopy = useRef(shown?.lines ?? null);
  const seq = useRef(0);
  const sendRef = useRef<(i: number) => Promise<void>>(async () => {});

  async function send(i: number) {
    const ep = endpoints[i];
    if (!ep) return;
    const param = params[i] ?? "";
    const body = bodies[i] ?? "";
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    setSel(i);
    setBusy(true);
    const t0 = performance.now();
    let next: Omit<Shown, "seq" | "changed">;
    try {
      const res = await fetch(fillPath(ep.path, param), {
        method: ep.method,
        cache: "no-store",
        signal: ctl.signal,
        ...(ep.method === "POST" ? { headers: { "content-type": "application/json" }, body } : {}),
      });
      const text = await res.text();
      const type = res.headers.get("content-type") ?? "";
      const json = type.includes("json");
      next = {
        ep: i,
        status: res.status,
        ms: Math.round(performance.now() - t0),
        bytes: new TextEncoder().encode(text).length,
        cache: res.headers.get("x-vercel-cache"),
        json,
        ...linesOf(text, json),
        svg: type.includes("svg") ? URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })) : null,
      };
    } catch (e) {
      if (ctl.signal.aborted) return;
      next = { ep: i, status: 0, ms: Math.round(performance.now() - t0), bytes: 0, cache: null, json: false, lines: [(e as Error).message || "network error"], more: 0, svg: null };
    }
    if (ctl.signal.aborted) {
      if (next.svg) URL.revokeObjectURL(next.svg);
      return;
    }
    const key = keyOf(ep, param, body);
    const prev = seen.current.get(key) ?? (i === 0 ? pageCopy.current : null);
    seen.current.set(key, next.lines);
    setShown({ ...next, seq: ++seq.current, changed: changedLines(prev, next.lines) });
    setBusy(false);
  }

  useEffect(() => {
    sendRef.current = send;
  });

  // Send GET /api/v1/chain by itself once the console is on screen (like the landing's first attack).
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let done = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (done || !entries.some((e) => e.isIntersecting)) return;
        done = true;
        io.disconnect();
        void sendRef.current(0);
      },
      { rootMargin: "0px 0px -30% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => () => inflight.current?.abort(), []);

  useEffect(() => {
    const url = shown?.svg;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shown?.svg]);

  const pick = (i: number) => {
    void send(i);
    // phones: the response pane sits under the list; bring it up if it's off screen
    const r = pane.current?.getBoundingClientRect();
    if (r && (r.top > window.innerHeight - 90 || r.bottom < 90)) pane.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const ep = endpoints[sel]!;
  const param = params[sel] ?? "";
  const body = bodies[sel] ?? "";
  const badge = ep.path.includes("/badge/");
  const copy = badge ? `![countersign](${site}${fillPath(ep.path, param)})` : curlOf(site, ep, param, body);
  const edit = (list: string[], i: number, v: string) => list.map((x, j) => (j === i ? v : x));

  return (
    <div className="console" ref={root}>
      <div className="console-list">
        {endpoints.map((e, i) => (
          <button key={e.path} type="button" className="api-row" aria-pressed={sel === i} onClick={() => pick(i)}>
            <span className={`m${e.method === "POST" ? " post" : ""}`}>{e.method}</span>
            <code>{e.path}</code>
            <span className="dim small">{e.desc}</span>
          </button>
        ))}
      </div>

      <div className="code console-out" ref={pane}>
        <div className="code-head">
          <span className="console-url">
            {ep.method} {fillPath(ep.path, param)}
          </span>
          <span className="console-btns">
            <CopyButton text={copy} label={badge ? "markdown" : "curl"} />
            <button type="button" className="console-send" disabled={busy} onClick={() => void send(sel)}>
              Send
            </button>
          </span>
        </div>

        {ep.param !== undefined ? (
          <div className="console-req">
            <input
              className="mono"
              value={param}
              aria-label="Version id"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setParams((p) => edit(p, sel, e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send(sel);
              }}
            />
          </div>
        ) : null}
        {ep.body !== undefined ? (
          <div className="console-req">
            <textarea
              className="mono"
              rows={4}
              value={body}
              aria-label="Request body (⌘ or Ctrl + Enter sends)"
              spellCheck={false}
              onChange={(e) => setBodies((b) => edit(b, sel, e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send(sel);
                }
              }}
            />
          </div>
        ) : null}

        <div className="console-status" aria-live="polite">
          {busy ? (
            <span>sending…</span>
          ) : shown ? (
            <>
              <Stamp kind={statusKind(shown.status)}>{shown.status ? statusLabel(shown.status) : "No response"}</Stamp>
              <span>{shown.ms === null ? "page cache" : `${shown.ms} ms`}</span>
              {shown.bytes ? <span>{fmtBytes(shown.bytes)}</span> : null}
              {shown.cache ? <span>cache {shown.cache.toLowerCase()}</span> : null}
            </>
          ) : (
            <span>pick a request</span>
          )}
        </div>

        {shown?.svg ? <img className="console-svg" src={shown.svg} alt="The badge this request returned" /> : null}
        <pre className={`bare json${busy ? " stale" : ""}`}>
          {shown?.lines.map((line, n) => (
            <span key={`${shown.seq}-${n}`} className={`ln${shown.changed.has(n) ? " chg" : ""}`}>
              {shown.json ? jsonTokens(line).map((t, j) => (t.k === "p" ? t.v : <span key={j} className={`j${t.k}`}>{t.v}</span>)) : line}
            </span>
          ))}
          {shown?.more ? <span className="ln jc">… {shown.more} more lines: copy the curl</span> : null}
        </pre>
      </div>
    </div>
  );
}
