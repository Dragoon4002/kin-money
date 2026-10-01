"use client";
import { erc20Abi, isAddressEqual, parseAbiItem, type Address, type Hex } from "viem";
import { addr, publicClient } from "./chain";
import { nameOf } from "./names";

// Activity feed straight from AUSD Transfer logs.
// ponytail: public Monad RPC caps eth_getLogs at 100 blocks and 25 req/s, so we scan incrementally from a
// per-account cursor cached in localStorage (first visit looks back DEPTH blocks ≈ 25 min).
// Full history needs an indexer (Envio) or an RPC with wider getLogs ranges.
const CHUNK = 100n;
const DEPTH = 5_000n;
const PARALLEL = 5;
const KEEP = 100;

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export type Item = {
  hash: Hex;
  logIndex: number;
  dir: "in" | "out";
  other: Address;
  amount: bigint;
  time: number; // unix ms
  who: string; // "@alice" or a friendly label
  when: string; // "5 min ago"
};

type Stored = { cursor: string; items: (Omit<Item, "amount" | "who" | "when"> & { amount: string })[] };

export function getBalance(me: Address): Promise<bigint> {
  return publicClient.readContract({ address: addr.ausd, abi: erc20Abi, functionName: "balanceOf", args: [me] });
}

const LABELS: [Address, string][] = [
  [addr.stream, "Allowance"],
  [addr.pot, "Family pot"],
  [addr.circle, "Circle"],
];

const names = new Map<string, Promise<string>>();
function who(other: Address, dir: Item["dir"]): Promise<string> {
  if (isAddressEqual(other, addr.escrow)) return Promise.resolve(dir === "in" ? "Unlocked for you" : "Held safely");
  const label = LABELS.find(([a]) => isAddressEqual(a, other))?.[1];
  if (label) return Promise.resolve(label);
  const k = other.toLowerCase();
  if (!names.has(k)) names.set(k, nameOf(other).catch(() => ""));
  return names.get(k)!.then((n) => (n ? `@${n}` : dir === "in" ? "Money received" : "Payment"));
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
export function ago(ms: number): string {
  const s = Math.round((ms - Date.now()) / 1000);
  if (s > -45) return "just now";
  for (const [unit, n] of [["minute", 60], ["hour", 3600], ["day", 86400]] as const) {
    const v = Math.round(s / n);
    if (Math.abs(v) < (unit === "minute" ? 60 : unit === "hour" ? 24 : 7)) return rtf.format(v, unit);
  }
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const inflight = new Map<string, Promise<Item[]>>();

/** Newest-first payments to/from `me`. Safe to poll; concurrent calls share one scan. */
export function loadActivity(me: Address): Promise<Item[]> {
  const k = me.toLowerCase();
  if (!inflight.has(k)) inflight.set(k, scan(me).finally(() => inflight.delete(k)));
  return inflight.get(k)!;
}

async function scan(me: Address): Promise<Item[]> {
  const key = `kin.activity.${me.toLowerCase()}`;
  const raw = localStorage.getItem(key);
  const cache: Stored = raw ? JSON.parse(raw) : { cursor: "0", items: [] };
  let items = cache.items.map((i) => ({ ...i, amount: BigInt(i.amount) }));

  try {
    const latest = await publicClient.getBlockNumber();
    const start = BigInt(cache.cursor) + 1n > latest - DEPTH ? BigInt(cache.cursor) + 1n : latest - DEPTH;
    const ranges: [bigint, bigint][] = [];
    for (let b = start; b <= latest; b += CHUNK) ranges.push([b, b + CHUNK - 1n < latest ? b + CHUNK - 1n : latest]);

    const found: typeof items = [];
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
    const stored: Stored = { cursor: latest.toString(), items: items.map((i) => ({ ...i, amount: i.amount.toString() })) };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // ponytail: rate-limited or offline — show what we have, next poll resumes from the saved cursor.
  }

  return Promise.all(items.map(async (i) => ({ ...i, who: await who(i.other, i.dir), when: ago(i.time) })));
}
