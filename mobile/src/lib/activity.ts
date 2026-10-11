import * as SecureStore from "expo-secure-store";
import { erc20Abi, formatLog, isAddressEqual, parseAbiItem, parseEventLogs, type Address, type Hex, type Log, type RpcLog } from "viem";
import { CATEGORIES } from "./categories";
import { API_BASE, addr, getMode, money, publicClient } from "./config";
import { describe, isKinContract } from "./counterparty";
import { nameOf, shortAddr } from "./names";

// Activity feed straight from AUSD Transfer logs (same as web lib/activity.ts).
// ponytail: public Monad RPC caps eth_getLogs at 100 blocks, so we scan the last DEPTH blocks in chunks,
// then incrementally from an in-memory cursor. Full history needs an indexer.
const CHUNK = 100n;
const DEPTH = 5_000n;
const PARALLEL = 5;
const KEEP = 100;

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

type Raw = { hash: Hex; logIndex: number; dir: "in" | "out"; other: Address; amount: bigint; time: number };
export type Item = Raw & { who: string; when: string };

/** Balance in the current mode (practice or real money). */
export function getBalance(me: Address): Promise<bigint> {
  const net = money();
  return net.client.readContract({ address: net.ausd, abi: erc20Abi, functionName: "balanceOf", args: [me] });
}

const LABELS: [Address, string][] = [
  [addr.stream, "Allowance"],
  [addr.pot, "Family pot"],
  [addr.circle, "Circle"],
];

const names = new Map<string, Promise<string>>();
function who(other: Address, dir: Raw["dir"]): Promise<string> {
  if (isAddressEqual(other, addr.escrow)) return Promise.resolve(dir === "in" ? "Unlocked for you" : "Held safely");
  const label = LABELS.find(([a]) => isAddressEqual(a, other))?.[1];
  if (label) return Promise.resolve(label);
  const k = other.toLowerCase();
  if (!names.has(k)) names.set(k, nameOf(other).catch(() => ""));
  return names.get(k)!.then((n) => (n ? `@${n}` : shortAddr(other)));
}

// ponytail: hand-rolled; Hermes' Intl.RelativeTimeFormat support is spotty.
export function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString();
}

const cache = new Map<string, { cursor: bigint; items: Raw[] }>();
const inflight = new Map<string, Promise<Raw[]>>();

/** Newest-first payments to/from `me` in recent blocks (fallback when server history is down). Concurrent calls share one scan. */
function recentPayments(me: Address): Promise<Raw[]> {
  const k = me.toLowerCase();
  if (!inflight.has(k)) inflight.set(k, scan(me).finally(() => inflight.delete(k)));
  return inflight.get(k)!;
}

async function scan(me: Address): Promise<Raw[]> {
  const k = me.toLowerCase();
  const c = cache.get(k) ?? { cursor: 0n, items: [] };
  let items = c.items;

  try {
    const latest = await publicClient.getBlockNumber();
    const start = c.cursor + 1n > latest - DEPTH ? c.cursor + 1n : latest - DEPTH;
    const ranges: [bigint, bigint][] = [];
    for (let b = start; b <= latest; b += CHUNK) ranges.push([b, b + CHUNK - 1n < latest ? b + CHUNK - 1n : latest]);

    const found: Raw[] = [];
    for (let i = 0; i < ranges.length; i += PARALLEL) {
      const batch = await Promise.all(
        ranges.slice(i, i + PARALLEL).map(([fromBlock, toBlock]) =>
          publicClient.getLogs({ address: addr.ausd, event: TRANSFER, fromBlock, toBlock }),
        ),
      );
      for (const log of batch.flat()) {
        const { from, to, value } = log.args;
        if (!from || !to || value === undefined) continue;
        const out = isAddressEqual(from, me);
        if (!out && !isAddressEqual(to, me)) continue;
        found.push({
          hash: log.transactionHash,
          logIndex: log.logIndex,
          dir: out ? "out" : "in",
          other: out ? to : from,
          amount: value,
          time: log.blockTimestamp ? Number(log.blockTimestamp) * 1000 : Date.now(),
        });
      }
    }
    const seen = new Set(items.map((i) => `${i.hash}:${i.logIndex}`));
    items = [...found.filter((i) => !seen.has(`${i.hash}:${i.logIndex}`)).reverse(), ...items].slice(0, KEEP);
    cache.set(k, { cursor: latest, items });
  } catch {
    // ponytail: rate-limited or offline — show what we have, next call resumes from the cursor.
  }

  return items;
}

// ---------- full feed (Activity tab): server history since deploy + live tail, web-style labels ----------

const TAIL = 300n;
const feedLast = new Map<string, Raw[]>(); // memory only, never stored on the phone
const feedInflight = new Map<string, Promise<Raw[]>>();
const feedKey = (me: Address) => `${getMode()}:${me.toLowerCase()}`;

/** Faucet that funds the sign-up welcome gift (same as web). */
const FAUCET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";

function feedWho(other: Address, dir: Raw["dir"], hash: Hex, me: Address): Promise<string> {
  if (isKinContract(other)) return describe(hash, other, dir, me);
  if (isAddressEqual(other, FAUCET)) return Promise.resolve("Welcome money");
  return who(other, dir);
}

/** Newest-first payments, unlabelled: full history via /api/history (falls back to the recent-block scan). Safe to poll. */
export function feedPayments(me: Address): Promise<Raw[]> {
  const k = feedKey(me);
  if (!feedInflight.has(k)) feedInflight.set(k, feedScan(me).finally(() => feedInflight.delete(k)));
  return feedInflight.get(k)!;
}

/** Last payments loaded this session for `me` in the current mode (no fetch). */
export const cachedFeed = (me: Address): Raw[] | null => feedLast.get(feedKey(me)) ?? null;

/** Names/labels for a slice of payments (cached per address/tx, so relabelling a longer slice is cheap). */
export const feedLabel = (raw: Raw[], me: Address): Promise<Item[]> =>
  Promise.all(raw.map(async (i) => ({ ...i, who: await feedWho(i.other, i.dir, i.hash, me), when: ago(i.time) })));

/** Newest KEEP payments, labelled (Spends). */
export const loadFeed = async (me: Address): Promise<Item[]> => feedLabel((await feedPayments(me)).slice(0, KEEP), me);

/**
 * Practice money, fast path (same as web): newest payments from Envio HyperIndex (/api/activity, names included) +
 * a live tail past the indexer's head. Throws when it's down, behind or empty → full history instead.
 */
async function indexedFeed(me: Address): Promise<Raw[]> {
  const [res, latest] = await Promise.all([
    fetch(`${API_BASE}/api/activity?address=${me}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("index unavailable")))),
    publicClient.getBlockNumber(),
  ]);
  const { payments, names: known, head } = res as {
    payments: { hash: Hex; logIndex: number; from: Address; to: Address; value: string; time: number }[];
    names: Record<string, string>;
    head: number;
  };
  if (head < 0 || latest - BigInt(head) > TAIL || !payments.length) throw new Error("index behind");
  for (const [a, n] of Object.entries(known)) if (!names.has(a)) names.set(a, Promise.resolve(n));
  const tail: Log[] = [];
  for (let b = BigInt(head) + 1n; b <= latest; b += CHUNK) {
    tail.push(...(await publicClient.getLogs({ address: addr.ausd, fromBlock: b, toBlock: b + CHUNK - 1n < latest ? b + CHUNK - 1n : latest })));
  }
  const seen = new Set(payments.map((p) => `${p.hash}:${p.logIndex}`));
  const fresh = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: tail })
    .filter((l) => (isAddressEqual(l.args.from, me) || isAddressEqual(l.args.to, me)) && !seen.has(`${l.transactionHash}:${l.logIndex}`))
    .map((l) => ({ hash: l.transactionHash, logIndex: l.logIndex, from: l.args.from, to: l.args.to, value: l.args.value.toString(), time: Date.now() / 1000 }))
    .reverse();
  return [...fresh, ...payments].map((p) => {
    const out = isAddressEqual(p.from, me);
    return { hash: p.hash, logIndex: p.logIndex, dir: out ? "out" : "in", other: out ? p.to : p.from, amount: BigInt(p.value), time: p.time * 1000 } as Raw;
  });
}

async function feedScan(me: Address): Promise<Raw[]> {
  const main = getMode() === "main";
  const k = `${main ? "main" : "test"}:${me.toLowerCase()}`;
  if (!main) {
    const raw = await indexedFeed(me).catch(() => null);
    if (raw) return feedLast.set(k, raw), raw;
  }
  try {
    if (main) {
      // Real money: this person's mainnet dollar transfers (server HyperSync query); no practice-network tail.
      const r = await fetch(`${API_BASE}/api/history?kind=transfers&net=main&address=${me}`);
      if (!r.ok) throw new Error("history unavailable");
      const { logs } = (await r.json()) as { logs: RpcLog[] };
      const found = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: logs.map((l) => formatLog(l)) }).flatMap((log) => {
        const { from: f, to, value } = log.args;
        const out = isAddressEqual(f, me);
        if (!out && !isAddressEqual(to, me)) return [];
        const time = log.blockTimestamp ? Number(log.blockTimestamp) * 1000 : Date.now();
        return [{ hash: log.transactionHash, logIndex: log.logIndex, dir: out ? "out" : "in", other: out ? to : f, amount: value, time } as Raw];
      });
      const raw = found.reverse();
      feedLast.set(k, raw);
      return raw;
    }
    const [res, latest] = await Promise.all([
      fetch(`${API_BASE}/api/history?kind=transfers&address=${me}`).then((r) => (r.ok ? (r.json() as Promise<{ logs: RpcLog[]; to: string }>) : Promise.reject(new Error("history unavailable")))),
      publicClient.getBlockNumber(),
    ]);
    const from = BigInt(res.to) + 1n > latest - TAIL ? BigInt(res.to) + 1n : latest - TAIL;
    const tail: Log[] = [];
    for (let b = from; b <= latest; b += CHUNK) {
      tail.push(...(await publicClient.getLogs({ address: addr.ausd, fromBlock: b, toBlock: b + CHUNK - 1n < latest ? b + CHUNK - 1n : latest })));
    }
    const seen = new Set<string>();
    const found = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: [...res.logs.map((l) => formatLog(l)), ...tail] }).flatMap((log) => {
      const { from: f, to, value } = log.args;
      const out = isAddressEqual(f, me);
      const id = `${log.transactionHash}:${log.logIndex}`;
      if ((!out && !isAddressEqual(to, me)) || seen.has(id)) return [];
      seen.add(id);
      const time = log.blockTimestamp ? Number(log.blockTimestamp) * 1000 : Date.now();
      return [{ hash: log.transactionHash, logIndex: log.logIndex, dir: out ? "out" : "in", other: out ? to : f, amount: value, time } as Raw];
    });
    const raw = found.reverse();
    feedLast.set(k, raw);
    return raw;
  } catch {
    // ponytail: server history down or offline — last good list, else the recent-block scan.
    return feedLast.get(k) ?? (main ? [] : recentPayments(me));
  }
}

/** Category the user picked for payment `hash` on this phone (null = none). */
export function categoryOf(hash: string) {
  let id: string | null = null;
  try {
    id = SecureStore.getItem(`kin.cat.${hash.toLowerCase()}`);
  } catch {}
  return CATEGORIES.find((c) => c.id === id) ?? null;
}
