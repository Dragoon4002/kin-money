import { createPublicClient, http, numberToHex, pad, type Hex, type RpcLog } from "viem";
import { monadTestnet } from "viem/chains";

// Full log history for Kin contracts + AUSD Transfers since deploy, served by /api/history.
// No relative imports and no "server-only" so scripts/check-history.mts can run it under plain node.
// HyperSync (https://10143.hypersync.xyz) needs an Envio API token (401 without one) — swap scan() for a
// single HyperSync query if ENVIO_API_TOKEN ever exists.
// ponytail: chunked eth_getLogs (public RPCs cap 100 blocks) into one in-memory log list per serverless
// instance. Cold instance backfills newest-first within BUDGET_MS per request, so very old history fills in
// over a few polls (~1s per 10 chunks ≈ 1k blocks). Memory/cold-start ceiling grows with chain age and AUSD
// traffic; upgrade path is HyperSync/Envio indexer or a persisted cursor (KV).
const DEPLOY = 67_103_075n;
const CHUNK = 100n;
const PARALLEL = 10;
const BUDGET_MS = 8_000;
const RPCS = ["https://testnet-rpc.monad.xyz", "https://rpc-testnet.monadinfra.com"];
export const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const clients = RPCS.map((url) => createPublicClient({ chain: monadTestnet, transport: http(url, { retryCount: 2 }) }));
const env = (v?: string) => (v ?? "").toLowerCase();
export const contracts = () => ({
  transfers: env(process.env.NEXT_PUBLIC_AUSD),
  escrow: env(process.env.NEXT_PUBLIC_KIN_ESCROW),
  pot: env(process.env.NEXT_PUBLIC_KIN_POT),
  circle: env(process.env.NEXT_PUBLIC_KIN_CIRCLE),
});
export type Kind = keyof ReturnType<typeof contracts>;

const pos = (l: RpcLog) => BigInt(l.blockNumber!) * 100_000n + BigInt(l.logIndex!);
export const byPos = (a: RpcLog, b: RpcLog) => (pos(a) < pos(b) ? -1 : pos(a) > pos(b) ? 1 : 0);

let lo = 0n; // covered range is [lo, hi]; empty until first sync
let hi = -1n;
let logs: RpcLog[] = [];
let syncing: Promise<void> | null = null;
let syncedAt = 0;

async function batch(ranges: [bigint, bigint][]): Promise<RpcLog[]> {
  const c = contracts();
  const address = [c.transfers, c.escrow, c.pot, c.circle].filter(Boolean) as Hex[];
  const got = await Promise.all(
    ranges.map(([from, to], i) => {
      const params = [{ address, fromBlock: numberToHex(from), toBlock: numberToHex(to) }] as const;
      const call = (n: number) => clients[n % clients.length].request({ method: "eth_getLogs", params } as never) as Promise<RpcLog[]>;
      return call(i).catch(() => call(i + 1));
    }),
  );
  // Keep only AUSD Transfers (Approvals etc. are noise) and every Kin contract event.
  return got.flat().filter((l) => l.address.toLowerCase() !== c.transfers || l.topics[0] === TRANSFER).sort(byPos);
}

async function scan() {
  const deadline = Date.now() + BUDGET_MS;
  const latest = await clients[0].getBlockNumber().catch(() => clients[1].getBlockNumber());
  if (hi < 0n) [lo, hi] = [latest + 1n, latest];
  try {
    while (hi < latest && Date.now() < deadline) {
      const ranges: [bigint, bigint][] = [];
      for (let a = hi + 1n; a <= latest && ranges.length < PARALLEL; a += CHUNK) ranges.push([a, a + CHUNK - 1n < latest ? a + CHUNK - 1n : latest]);
      logs = [...logs, ...(await batch(ranges))];
      hi = ranges.at(-1)![1];
    }
    while (lo > DEPLOY && Date.now() < deadline) {
      const ranges: [bigint, bigint][] = [];
      for (let b = lo - 1n; b >= DEPLOY && ranges.length < PARALLEL; b -= CHUNK) ranges.push([b - CHUNK + 1n > DEPLOY ? b - CHUNK + 1n : DEPLOY, b]);
      logs = [...(await batch(ranges)), ...logs];
      lo = ranges.at(-1)![0];
    }
  } catch {
    // ponytail: RPC hiccup — keep contiguous progress, next request resumes.
  }
}

/** Extend the cache toward head and back toward deploy (≤ BUDGET_MS). Concurrent callers share one scan. */
export function sync(): Promise<void> {
  if (Date.now() - syncedAt < 1_000) return Promise.resolve();
  syncing ??= scan().finally(() => {
    syncing = null;
    syncedAt = Date.now();
  });
  return syncing;
}

/** Logs of `kind`, oldest first. Transfers are filtered to those from/to `who`. */
export function pick(all: RpcLog[], kind: Kind, who?: string): RpcLog[] {
  const target = contracts()[kind];
  const topic = who ? pad(who.toLowerCase() as Hex) : "";
  return all.filter(
    (l) => l.address.toLowerCase() === target && (kind !== "transfers" || l.topics[1] === topic || l.topics[2] === topic),
  );
}

/** Cached logs now. Covered blocks [from, to]; `complete` = backfill reached the deploy block. */
export function history(kind: Kind, who?: string) {
  const out = pick(logs, kind, who);
  return { logs: kind === "transfers" ? out.slice(-200) : out, from: lo.toString(), to: hi.toString(), complete: lo <= DEPLOY };
}
