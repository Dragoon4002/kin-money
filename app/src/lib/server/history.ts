import neo4j, { type Driver } from "neo4j-driver";
import { createPublicClient, http, numberToHex, pad, type Hex, type RpcLog } from "viem";
import { monadTestnet } from "viem/chains";

// Full log history for Kin contracts + AUSD Transfers since deploy, served by /api/history.
// No relative imports and no "server-only" so scripts/check-history.mts can run it under plain node.
// HyperSync (https://10143.hypersync.xyz) needs an Envio API token (401 without one) — swap scan() for a
// single HyperSync query if ENVIO_API_TOKEN ever exists.
// Chunked eth_getLogs (public RPCs cap 100 blocks). Scanned logs + the covered block range are PERSISTED in
// Neo4j (HistLog / HistCursor), so every serverless instance starts from the full history instead of
// rescanning from zero: a cold instance loads them, then only scans new blocks since the saved cursor.
// ponytail: whole log set is loaded into memory per instance (~hundreds of logs on testnet). Past ~50k logs,
// query Neo4j per request by address/topic instead of loading everything.
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
  stream: env(process.env.NEXT_PUBLIC_KIN_STREAM),
  mandate: env(process.env.NEXT_PUBLIC_KIN_MANDATE),
  giftlink: env(process.env.NEXT_PUBLIC_KIN_GIFTLINK),
});
export type Kind = keyof ReturnType<typeof contracts>;

const pos = (l: RpcLog) => BigInt(l.blockNumber!) * 100_000n + BigInt(l.logIndex!);
export const byPos = (a: RpcLog, b: RpcLog) => (pos(a) < pos(b) ? -1 : pos(a) > pos(b) ? 1 : 0);

let lo = 0n; // covered range is [lo, hi]; empty until first sync
let hi = -1n;
let logs: RpcLog[] = [];
let syncing: Promise<void> | null = null;
let syncedAt = 0;
let loading: Promise<void> | null = null;

// ---------- persistence (Neo4j) ----------
let driver: Driver | null = null;
function db(): Driver | null {
  const { NEO4J_URI, NEO4J_PASSWORD } = process.env;
  const user = process.env.NEO4J_USER ?? process.env.NEO4J_USERNAME;
  if (!NEO4J_URI || !user || !NEO4J_PASSWORD) return null;
  driver ??= neo4j.driver(NEO4J_URI, neo4j.auth.basic(user, NEO4J_PASSWORD), { disableLosslessIntegers: true });
  return driver;
}
const keyOf = (l: RpcLog) => `${l.transactionHash}:${l.logIndex}`;

/** Cold start: load the saved range + logs so this instance doesn't rescan history. */
async function load() {
  const d = db();
  if (!d) return;
  try {
    // One round-trip: cursor + every stored log (Aura latency dominates cold starts).
    const res = await d.executeQuery(
      "MATCH (c:HistCursor {id: 'v1'}) OPTIONAL MATCH (l:HistLog) RETURN c.lo AS lo, c.hi AS hi, collect(l.json) AS logs",
    );
    const c = res.records[0];
    if (!c) return;
    logs = (c.get("logs") as string[]).map((j) => JSON.parse(j) as RpcLog).sort(byPos);
    [lo, hi] = [BigInt(c.get("lo") as string), BigInt(c.get("hi") as string)];
  } catch {
    // ponytail: DB down → fall back to in-memory scanning from the head.
  }
}

/** Save newly scanned logs and widen the stored range (never narrows; parallel instances are safe). */
let constrained = false;
async function save(fresh: RpcLog[]) {
  const d = db();
  if (!d || hi < lo) return;
  try {
    if (!constrained && fresh.length) {
      await d.executeQuery("CREATE CONSTRAINT hist_log_key IF NOT EXISTS FOR (l:HistLog) REQUIRE l.key IS UNIQUE");
      constrained = true;
    }
    if (fresh.length)
      await d.executeQuery(
        "UNWIND $rows AS r MERGE (l:HistLog {key: r.key}) ON CREATE SET l.json = r.json, l.address = r.address, l.block = r.block",
        { rows: fresh.map((l) => ({ key: keyOf(l), json: JSON.stringify(l), address: l.address.toLowerCase(), block: Number(l.blockNumber) })) },
      );
    await d.executeQuery(
      `MERGE (c:HistCursor {id: 'v1'}) ON CREATE SET c.lo = $lo, c.hi = $hi
       SET c.lo = CASE WHEN toInteger(c.lo) <= toInteger($lo) THEN c.lo ELSE $lo END,
           c.hi = CASE WHEN toInteger(c.hi) >= toInteger($hi) THEN c.hi ELSE $hi END`,
      { lo: lo.toString(), hi: hi.toString() },
    );
  } catch {}
}

async function batch(ranges: [bigint, bigint][]): Promise<RpcLog[]> {
  const c = contracts();
  const address = Object.values(c).filter(Boolean) as Hex[];
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

/** Load the persisted history once per instance (fast DB read). Await before answering. */
export const warm = () => (loading ??= load());

async function scan() {
  await warm();
  const deadline = Date.now() + BUDGET_MS;
  const latest = await clients[0].getBlockNumber().catch(() => clients[1].getBlockNumber());
  if (hi < 0n) [lo, hi] = [latest + 1n, latest];
  const fresh: RpcLog[] = [];
  try {
    while (hi < latest && Date.now() < deadline) {
      const ranges: [bigint, bigint][] = [];
      for (let a = hi + 1n; a <= latest && ranges.length < PARALLEL; a += CHUNK) ranges.push([a, a + CHUNK - 1n < latest ? a + CHUNK - 1n : latest]);
      const got = await batch(ranges);
      logs = [...logs, ...got];
      fresh.push(...got);
      hi = ranges.at(-1)![1];
    }
    while (lo > DEPLOY && Date.now() < deadline) {
      const ranges: [bigint, bigint][] = [];
      for (let b = lo - 1n; b >= DEPLOY && ranges.length < PARALLEL; b -= CHUNK) ranges.push([b - CHUNK + 1n > DEPLOY ? b - CHUNK + 1n : DEPLOY, b]);
      const got = await batch(ranges);
      logs = [...got, ...logs];
      fresh.push(...got);
      lo = ranges.at(-1)![0];
    }
  } catch {
    // ponytail: RPC hiccup — keep contiguous progress, next request resumes.
  }
  await save(fresh);
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
