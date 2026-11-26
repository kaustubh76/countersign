import {
  createPublicClient,
  fallback,
  http,
  type Address,
  type Hash,
  type PublicClient,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import { bsc } from "viem/chains";
import { BSC_CHAIN_ID } from "./constants.js";

/**
 * Public BSC endpoints, in preference order. Measured on 2026-11-26:
 *   old tx by hash:   dataseed, publicnode, drpc (1rpc misses old txs)
 *   old receipts:     dataseed, 1rpc            (publicnode wants an archive token, drpc rate-limits)
 *   eth_getLogs:      effectively unusable for history (≈22 h on publicnode), so COUNTERSIGN never needs it.
 * Txs and receipts are fetched with a per-endpoint fallback, because an endpoint that lacks history returns
 * "not found" (a result, not an error) and a normal transport fallback would accept that answer.
 */
export const BSC_PUBLIC_RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-rpc.publicnode.com",
  "https://1rpc.io/bnb",
  "https://bsc.drpc.org",
] as const;

export interface ChainReader {
  chainId: number;
  /** For eth_call / views (transport-level fallback across endpoints). */
  client: PublicClient;
  getTransaction(hash: Hash): Promise<Transaction | null>;
  getReceipt(hash: Hash): Promise<TransactionReceipt | null>;
  getCode(address: Address): Promise<`0x${string}` | undefined>;
  getBlockNumber(): Promise<bigint>;
}

export interface ReaderOptions {
  chainId?: number;
  rpcUrls?: readonly string[];
  /** Per-request timeout in ms (default 12 s). */
  timeoutMs?: number;
}

export function rpcUrlsFromEnv(env: Record<string, string | undefined> = process.env): string[] | undefined {
  const list = env.COUNTERSIGN_RPC_URLS ?? env.BSC_RPC_URL;
  return list ? list.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

export function createReader(opts: ReaderOptions = {}): ChainReader {
  const chainId = opts.chainId ?? BSC_CHAIN_ID;
  const urls = opts.rpcUrls?.length ? [...opts.rpcUrls] : [...BSC_PUBLIC_RPCS];
  const timeout = opts.timeoutMs ?? 12_000;
  const chain = chainId === BSC_CHAIN_ID ? bsc : { ...bsc, id: chainId, name: `chain-${chainId}` };
  const perEndpoint = urls.map((url) =>
    createPublicClient({ chain, transport: http(url, { timeout, retryCount: 1, retryDelay: 300 }) }),
  ) as PublicClient[];
  const client = createPublicClient({
    chain,
    transport: fallback(urls.map((url) => http(url, { timeout, retryCount: 1, retryDelay: 300 }))),
  }) as PublicClient;

  const txCache = new Map<string, Transaction>();
  const receiptCache = new Map<string, TransactionReceipt>();

  async function firstFound<T>(fn: (c: PublicClient) => Promise<T | null | undefined>): Promise<T | null> {
    for (const c of perEndpoint) {
      try {
        const value = await fn(c);
        if (value !== null && value !== undefined) return value;
      } catch {
        // not found on this endpoint, rate-limited, or down: try the next one
      }
    }
    return null;
  }

  return {
    chainId,
    client,
    async getTransaction(hash) {
      const key = hash.toLowerCase();
      const hit = txCache.get(key);
      if (hit) return hit;
      const tx = await firstFound((c) => c.getTransaction({ hash }));
      if (tx?.blockNumber != null) txCache.set(key, tx); // mined txs are immutable
      return tx;
    },
    async getReceipt(hash) {
      const key = hash.toLowerCase();
      const hit = receiptCache.get(key);
      if (hit) return hit;
      const receipt = await firstFound((c) => c.getTransactionReceipt({ hash }));
      if (receipt) receiptCache.set(key, receipt);
      return receipt;
    },
    async getCode(address) {
      return (await firstFound(async (c) => (await c.getCode({ address })) ?? "0x")) ?? undefined;
    },
    getBlockNumber: () => client.getBlockNumber(),
  };
}
