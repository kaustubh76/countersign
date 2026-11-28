import { describe, expect, it } from "vitest";
import { changedLines, curlOf, fillPath, fmtBytes, jsonTokens, prettyJson, statusKind, statusLabel, type ApiEndpoint } from "../lib/apiConsole";

const SITE = "https://countersign-proof.vercel.app";

describe("/docs API console helpers", () => {
  it("fills the path id, trimmed and URL-encoded", () => {
    expect(fillPath("/api/v1/version/<id>", " 0xab ")).toBe("/api/v1/version/0xab");
    expect(fillPath("/api/v1/badge/<id>.svg", "a/b?c")).toBe("/api/v1/badge/a%2Fb%3Fc.svg");
    expect(fillPath("/api/v1/chain")).toBe("/api/v1/chain");
  });

  it("prints the same request as a curl you can paste", () => {
    const get: ApiEndpoint = { method: "GET", path: "/api/v1/chain", desc: "" };
    expect(curlOf(SITE, get)).toBe(`curl -s ${SITE}/api/v1/chain`);
    const post: ApiEndpoint = { method: "POST", path: "/api/v1/check", desc: "", body: "" };
    expect(curlOf(SITE, post, "", '{\n  "uri": "https://github.com/o/r/tree/abc/x"\n}')).toBe(
      `curl -s -X POST ${SITE}/api/v1/check -H 'content-type: application/json' -d '{"uri":"https://github.com/o/r/tree/abc/x"}'`,
    );
    // single quotes survive the shell; non-JSON is sent as typed
    expect(curlOf(SITE, post, "", `{"uri":"it's"}`)).toContain(`-d '{"uri":"it'\\''s"}'`);
    expect(curlOf(SITE, post, "", "not json")).toMatch(/-d 'not json'$/);
    // anything a shell would mangle gets quoted
    expect(curlOf("https://x.test", { method: "GET", path: "/a?b=1&c", desc: "" })).toBe("curl -s 'https://x.test/a?b=1&c'");
  });

  it("tints pretty JSON without losing a character", () => {
    const text = prettyJson(JSON.stringify({ chainId: 56, block: "52714012", deployed: false, contracts: null, registry: { name: 'SPACE ID: "x"' }, n: -1.5e3, list: [1, true] }))!;
    for (const line of text.split("\n")) expect(jsonTokens(line).map((t) => t.v).join("")).toBe(line);
    expect(jsonTokens('  "chainId": 56,')).toEqual([
      { k: "p", v: "  " },
      { k: "k", v: '"chainId"' },
      { k: "p", v: ": " },
      { k: "n", v: "56" },
      { k: "p", v: "," },
    ]);
    expect(jsonTokens('    "deployed": false,').map((t) => t.k)).toEqual(["p", "k", "p", "l", "p"]);
    expect(jsonTokens('    "block": "52714012",').map((t) => t.k)).toEqual(["p", "k", "p", "s", "p"]);
    // a colon inside a string value is not a key
    expect(jsonTokens('  "name": "SPACE ID: \\"x\\""').filter((t) => t.k === "k")).toHaveLength(1);
    expect(prettyJson("<svg/>")).toBeNull();
  });

  it("marks only the lines that changed since the last send", () => {
    expect([...changedLines(["{", '  "block": "1",', '  "at": "t1"', "}"], ["{", '  "block": "2",', '  "at": "t2"', "}"])]).toEqual([1, 2]);
    expect(changedLines(null, ["{"]).size).toBe(0);
    expect(changedLines(["{", "}"], ["{", "}"]).size).toBe(0);
  });

  it("labels statuses (HTTP/2 has no status text) and sizes", () => {
    expect(statusLabel(200)).toBe("200 OK");
    expect(statusLabel(404)).toBe("404 Not found");
    expect(statusLabel(418)).toBe("418");
    expect([200, 404, 429, 503, 0].map(statusKind)).toEqual(["ok", "warn", "warn", "bad", "bad"]);
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(20480)).toBe("20 KB");
  });
});
