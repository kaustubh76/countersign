import { describe, expect, it } from "vitest";
import { getAddress, keccak256, pad, zeroAddress, type Address, type Hex } from "viem";
import { analyzeContracts, parseEtherscanSource, sourceHashOf, type FetchSourcesOptions } from "../src/sources.js";

const A = getAddress("0x1111111111111111111111111111111111111111");
const IMPL = getAddress("0x2222222222222222222222222222222222222222");
const CODE = "0x6080604052" as Hex;
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const TOKEN = `pragma solidity ^0.8.20;
contract T { address public owner; modifier onlyOwner() { require(msg.sender == owner); _; }
  function mint(address a) external onlyOwner { a; } }`;

type Route = (url: string) => { status: number; body: unknown };
function fetcher(route: Route): typeof fetch {
  return (async (input: string | URL | Request) => {
    const { status, body } = route(String(input));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
const sourcifyHit = (files: Record<string, string>, name = "T") => ({
  status: 200,
  body: { match: "exact_match", sources: Object.fromEntries(Object.entries(files).map(([p, c]) => [p, { content: c }])), compilation: { name, language: "Solidity" } },
});
const opts = (route: Route, over: Partial<FetchSourcesOptions> = {}): FetchSourcesOptions => ({
  chainId: 56,
  getCode: async () => CODE,
  getStorageAt: async () => pad("0x0", { size: 32 }),
  fetchImpl: fetcher(route),
  ...over,
});

describe("verified source for RL4", () => {
  it("reads Sourcify first and pins exactly which files it analysed", async () => {
    const [c] = await analyzeContracts([A], opts((u) => (u.includes("sourcify") ? sourcifyHit({ "T.sol": TOKEN }) : { status: 500, body: {} })));
    expect(c).toMatchObject({ status: "verified", provider: "sourcify", contractName: "T", codehash: keccak256(CODE), sourceHash: sourceHashOf({ "T.sol": TOKEN }) });
    expect(c!.powers.map((p) => p.fn)).toEqual(["mint"]);
  });

  it("a Sourcify miss without an Etherscan key is unavailable, never 'unverified'", async () => {
    const [c] = await analyzeContracts([A], opts(() => ({ status: 404, body: { match: null } })));
    expect(c!.status).toBe("unavailable");
    expect(c!.detail).toMatch(/not on Sourcify; BscScan not consulted/);
  });

  it("with a key, Etherscan answers: flat, {{standard-json}} and multi-file source; empty means unverified", async () => {
    const etherscan = (SourceCode: string): Route => (u) =>
      u.includes("sourcify") ? { status: 404, body: {} } : { status: 200, body: { status: "1", result: [{ SourceCode, ContractName: "T", ABI: "[]" }] } };
    const flat = (await analyzeContracts([A], opts(etherscan(TOKEN), { etherscanKey: "k" })))[0]!;
    expect(flat).toMatchObject({ status: "verified", provider: "etherscan" });
    const std = JSON.stringify({ language: "Solidity", sources: { "src/T.sol": { content: TOKEN } } });
    expect(Object.keys(parseEtherscanSource(`{${std}}`, "T"))).toEqual(["src/T.sol"]);
    expect(Object.keys(parseEtherscanSource(JSON.stringify({ "a/T.sol": { content: TOKEN } }), "T"))).toEqual(["a/T.sol"]);
    expect(parseEtherscanSource(TOKEN, "T")).toEqual({ "T.sol": TOKEN });
    const none = (await analyzeContracts([A], opts(etherscan(""), { etherscanKey: "k" })))[0]!;
    expect(none.status).toBe("unverified");
  });

  it("an Etherscan error (status 0) or a rate limit is unavailable, not an answer", async () => {
    const err: Route = (u) => (u.includes("sourcify") ? { status: 404, body: {} } : { status: 200, body: { status: "0", message: "NOTOK", result: "Free API access is not supported for this chain" } });
    expect((await analyzeContracts([A], opts(err, { etherscanKey: "k" })))[0]!.status).toBe("unavailable");
    expect((await analyzeContracts([A], opts(() => ({ status: 429, body: {} }))))[0]!.status).toBe("unavailable");
  });

  it("no code at the address", async () => {
    const [c] = await analyzeContracts([A], opts(() => ({ status: 404, body: {} }), { getCode: async () => "0x" }));
    expect(c!.status).toBe("no-code");
  });

  it("an EIP-1967 proxy: the implementation is analysed too, and the proxy admin is an upgrade power", async () => {
    const route: Route = (u) => (u.toLowerCase().includes(IMPL.toLowerCase()) ? sourcifyHit({ "T.sol": TOKEN }) : sourcifyHit({ "P.sol": "contract P {}" }, "P"));
    const [c] = await analyzeContracts(
      [A],
      opts(route, { getStorageAt: async (a: Address, slot: Hex) => (a === A && slot === IMPL_SLOT ? pad(IMPL, { size: 32 }) : pad("0x0", { size: 32 })) }),
    );
    expect(c!.proxy).toEqual({ kind: "eip1967", implementation: IMPL });
    expect(c!.powers.map((p) => p.category)).toEqual(["upgrade"]);
    expect(c!.implementation).toMatchObject({ address: IMPL, status: "verified" });
    expect(c!.implementation!.powers.map((p) => p.fn)).toEqual(["mint"]);
  });

  it("an EIP-1167 clone is not upgradeable: only its implementation is analysed", async () => {
    const clone = `0x363d3d373d3d3d363d73${IMPL.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex;
    const [c] = await analyzeContracts([A], opts(() => sourcifyHit({ "T.sol": TOKEN }), { getCode: async (a) => (a === A ? clone : CODE) }));
    expect(c!.proxy).toEqual({ kind: "clone", implementation: IMPL });
    expect(c!.powers.some((p) => p.category === "upgrade")).toBe(false);
  });

  it("a renounced owner marks ownership-only powers dead", async () => {
    const [c] = await analyzeContracts([A], opts(() => sourcifyHit({ "T.sol": TOKEN }), { readOwner: async () => zeroAddress }));
    expect(c!.owner).toBe(zeroAddress);
    expect(c!.powers[0]!.dead).toBe(true);
  });

  it("local sources are for local chains only, and a local chain never asks Sourcify", async () => {
    let asked = false;
    const route: Route = () => {
      asked = true;
      return { status: 404, body: {} };
    };
    const local = { [A.toLowerCase()]: { files: { "T.sol": TOKEN }, contractName: "T" } };
    expect((await analyzeContracts([A], opts(route, { localSources: local })))[0]!.status).toBe("unavailable");
    const [c] = await analyzeContracts([A], opts(route, { chainId: 31337, localSources: local }));
    expect(c).toMatchObject({ status: "verified", provider: "local" });
    expect((await analyzeContracts([IMPL], opts(route, { chainId: 31337 })))[0]!.status).toBe("unavailable");
    expect(asked).toBe(false);
  });
});
