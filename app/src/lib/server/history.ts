import neo4j, { type Driver } from "neo4j-driver";
import { createPublicClient, http, numberToHex, pad, type Hex, type RpcLog } from "viem";
import { monadTestnet } from "viem/chains";

// Full log history for Kin contracts + AUSD Transfers since deploy, served by /api/history.
// No relative imports and no "server-only" so scripts/check-history.mts can run it under plain node.
// Sources, first that works wins: ENVIO_GRAPHQL_URL → Envio HyperIndex (indexer/, typed Activity rows);
// ENVIO_API_TOKEN → Envio HyperSync (whole range in one paged query); else chunked eth_getLogs.
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
    if (fresh.length) {
      // `notified` = this query's timestamp() only on the node it just created, so exactly one instance
      // (the one that first indexed the log) sends its notification; re-saves and other instances don't.
      const res = await d.executeQuery(
        `UNWIND $rows AS r MERGE (l:HistLog {key: r.key})
         ON CREATE SET l.json = r.json, l.address = r.address, l.block = r.block, l.notified = timestamp()
         WITH r, l WHERE l.notified = timestamp() RETURN r.key AS key`,
        { rows: fresh.map((l) => ({ key: keyOf(l), json: JSON.stringify(l), address: l.address.toLowerCase(), block: Number(l.blockNumber) })) },
      );
      const created = new Set(res.records.map((r) => r.get("key") as string));
      // ponytail: ~10 min of Monad blocks (~0.4s each) so history backfills don't spam old events.
      const recent = fresh.filter((l) => created.has(keyOf(l)) && BigInt(l.blockNumber!) + 1_500n >= hi);
      // Extensionless dynamic import: resolves under Next; under plain-node scripts it just fails quietly.
      if (recent.length) await import("./push").then((m) => m.notifyLogs(recent, contracts())).catch(() => {});
    }
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

/** Logs pushed to us (Alchemy webhook): stored like scanned logs, so whichever path sees a log first sends
 *  its notification and the other is a no-op. The cursor isn't moved; the next scan fills the range. */
export async function ingest(fresh: RpcLog[]) {
  await warm();
  await save(fresh);
}

// ---------- Envio HyperSync ----------
const HYPERSYNC = "https://10143.hypersync.xyz";
type HsLog = { block_number: number; log_index: number; transaction_index: number; transaction_hash: Hex; address: Hex; data: Hex; topic0?: Hex | null; topic1?: Hex | null; topic2?: Hex | null; topic3?: Hex | null };
type HsPage = { data?: { logs?: HsLog[]; blocks?: { number: number; timestamp: string | number }[] }[]; next_block: number; archive_height: number };

/** HyperSync log → the same RpcLog shape eth_getLogs returns (so storage and consumers are unchanged). */
export function toRpcLog(l: HsLog, ts?: string | number): RpcLog {
  return {
    address: l.address.toLowerCase() as Hex,
    topics: [l.topic0, l.topic1, l.topic2, l.topic3].filter((t): t is Hex => !!t) as RpcLog["topics"],
    data: l.data,
    blockHash: null,
    blockNumber: numberToHex(l.block_number),
    transactionHash: l.transaction_hash,
    transactionIndex: numberToHex(l.transaction_index),
    logIndex: numberToHex(l.log_index),
    removed: false,
    ...(ts !== undefined ? { blockTimestamp: numberToHex(BigInt(ts)) } : {}),
  } as RpcLog;
}

/** All Kin logs + AUSD Transfers in [from, to) via HyperSync (paged). Returns logs and the next block. */
async function hypersync(from: bigint, to?: bigint): Promise<{ logs: RpcLog[]; next: bigint }> {
  const token = process.env.ENVIO_API_TOKEN!;
  const c = contracts();
  const kin = Object.entries(c).filter(([k, a]) => k !== "transfers" && a).map(([, a]) => a);
  const out: RpcLog[] = [];
  let next = from;
  for (let page = 0; page < 50; page++) {
    const body = {
      from_block: Number(next),
      ...(to !== undefined ? { to_block: Number(to) } : {}),
      logs: [{ address: [c.transfers], topics: [[TRANSFER]] }, { address: kin }],
      field_selection: {
        log: ["block_number", "log_index", "transaction_index", "transaction_hash", "address", "data", "topic0", "topic1", "topic2", "topic3"],
        block: ["number", "timestamp"],
      },
    };
    const res = await fetch(`${HYPERSYNC}/query`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`hypersync ${res.status}`);
    const j = (await res.json()) as HsPage;
    const times = new Map(j.data?.flatMap((d) => d.blocks ?? []).map((b) => [b.number, b.timestamp]));
    out.push(...(j.data?.flatMap((d) => d.logs ?? []) ?? []).map((l) => toRpcLog(l, times.get(l.block_number))));
    next = BigInt(j.next_block);
    if (to !== undefined ? next >= to : next > BigInt(j.archive_height)) break;
  }
  return { logs: out.sort(byPos), next };
}

/** HyperSync path: backfill to deploy and catch up to head in ≤2 queries. False → caller uses RPC scan. */
async function scanHypersync(fresh: RpcLog[]): Promise<boolean> {
  if (!process.env.ENVIO_API_TOKEN) return false;
  try {
    if (hi < 0n) {
      const { logs: got, next } = await hypersync(DEPLOY);
      logs = got;
      fresh.push(...got);
      [lo, hi] = [DEPLOY, next - 1n];
      return true;
    }
    if (lo > DEPLOY) {
      const { logs: got } = await hypersync(DEPLOY, lo);
      logs = [...got, ...logs];
      fresh.push(...got);
      lo = DEPLOY;
    }
    const { logs: got, next } = await hypersync(hi + 1n);
    logs = [...logs, ...got];
    fresh.push(...got);
    if (next - 1n > hi) hi = next - 1n;
    return true;
  } catch {
    return false; // ponytail: HyperSync down → RPC scan below keeps history working.
  }
}

// ---------- Envio HyperIndex (indexer/, GraphQL) ----------
// Activity rows carry the raw topics + data, so they rebuild the exact logs the other sources return.
type IdxRow = { contract: Hex; topics: string; rawData: Hex; blockNumber: number; timestamp: number; txHash: Hex; logIndex: number };
const IDX_PAGE = 1000;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(process.env.ENVIO_GRAPHQL_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(BUDGET_MS) });
  const j = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || j.errors || !j.data) throw new Error(`index ${res.status}`);
  return j.data;
}

/** Logs in (after, head] from the HyperIndex GraphQL, head = the indexer's progress block. */
async function indexed(after: bigint): Promise<{ logs: RpcLog[]; head: bigint }> {
  const { _meta } = await gql<{ _meta: { chainId: number; progressBlock: number } | { chainId: number; progressBlock: number }[] }>("{ _meta { chainId progressBlock } }");
  const head = BigInt([_meta].flat().find((m) => m.chainId === monadTestnet.id)?.progressBlock ?? -1);
  const want = new Set(Object.values(contracts()).filter(Boolean));
  const out = new Map<string, RpcLog>(); // rows are per involved account → dedupe to one log
  for (let offset = 0; offset < 100 * IDX_PAGE; offset += IDX_PAGE) {
    const { Activity: rows } = await gql<{ Activity: IdxRow[] }>(
      `query($after: Int!, $head: Int!, $offset: Int!) { Activity(where: {blockNumber: {_gt: $after, _lte: $head}}, order_by: [{blockNumber: asc}, {logIndex: asc}, {id: asc}], limit: ${IDX_PAGE}, offset: $offset) { contract topics rawData blockNumber timestamp txHash logIndex } }`,
      { after: Number(after), head: Number(head), offset },
    );
    for (const r of rows) {
      if (!want.has(r.contract.toLowerCase())) continue; // e.g. the retired pot, not read by the app
      const [topic0, topic1, topic2, topic3] = JSON.parse(r.topics) as Hex[];
      // ponytail: transaction_index isn't indexed (no consumer reads it).
      const log = toRpcLog({ block_number: r.blockNumber, log_index: r.logIndex, transaction_index: 0, transaction_hash: r.txHash, address: r.contract, data: r.rawData, topic0, topic1, topic2, topic3 }, r.timestamp);
      out.set(keyOf(log), log);
    }
    if (rows.length < IDX_PAGE) break;
  }
  return { logs: [...out.values()], head };
}

/** HyperIndex path (when ENVIO_GRAPHQL_URL is set). False → caller falls through to HyperSync, then RPC. */
async function scanIndex(fresh: RpcLog[]): Promise<boolean> {
  if (!process.env.ENVIO_GRAPHQL_URL) return false;
  try {
    const { logs: got, head } = await indexed(hi < 0n || lo > DEPLOY ? DEPLOY - 1n : hi);
    if (head < DEPLOY || head < hi) return false; // indexer still syncing / behind our cache
    const known = new Set(logs.map(keyOf));
    const add = got.filter((l) => !known.has(keyOf(l)));
    logs = [...logs, ...add].sort(byPos);
    fresh.push(...add);
    [lo, hi] = [DEPLOY, head];
    return true;
  } catch {
    return false;
  }
}

async function scan() {
  await warm();
  const viaEnvio: RpcLog[] = [];
  if ((await scanIndex(viaEnvio)) || (await scanHypersync(viaEnvio))) return save(viaEnvio);
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

/** This instance caught up within the last minute: the client's own tail (newest 300 blocks ≈ 2 min) covers the rest. */
export const syncedRecently = () => Date.now() - syncedAt < 60_000;

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

// ---------- Real money (mainnet): one person's AUSD transfers via HyperSync ----------
// ponytail: no persistence/cache — a real-money account has few transfers; query per request.
const MAIN_HYPERSYNC = "https://143.hypersync.xyz";
const MAIN_AUSD = "0x00000000efe302beaa2b3e6e1b18d08d69a9012a";

/** AUSD Transfer logs from/to `me` on Monad mainnet, oldest first, plus the last block covered. */
export async function mainTransfers(me: string): Promise<{ logs: RpcLog[]; to: string; complete: boolean }> {
  const token = process.env.ENVIO_API_TOKEN;
  if (!token) throw new Error("hypersync token missing");
  const t = pad(me.toLowerCase() as Hex);
  const out: RpcLog[] = [];
  let next = 0;
  let height = 0;
  for (let page = 0; page < 20; page++) {
    const body = {
      from_block: next,
      logs: [
        { address: [MAIN_AUSD], topics: [[TRANSFER], [t]] },
        { address: [MAIN_AUSD], topics: [[TRANSFER], [], [t]] },
      ],
      field_selection: {
        log: ["block_number", "log_index", "transaction_index", "transaction_hash", "address", "data", "topic0", "topic1", "topic2", "topic3"],
        block: ["number", "timestamp"],
      },
    };
    const res = await fetch(`${MAIN_HYPERSYNC}/query`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`hypersync ${res.status}`);
    const j = (await res.json()) as HsPage;
    const times = new Map(j.data?.flatMap((d) => d.blocks ?? []).map((b) => [b.number, b.timestamp]));
    out.push(...(j.data?.flatMap((d) => d.logs ?? []) ?? []).map((l) => toRpcLog(l, times.get(l.block_number))));
    next = j.next_block;
    height = j.archive_height;
    if (next >= height) break;
  }
  return { logs: out.sort(byPos), to: String(Math.min(next, height + 1) - 1), complete: next >= height };
}
