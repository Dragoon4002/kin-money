import { erc20Abi, isAddressEqual, parseAbiItem, type Address, type Hex } from "viem";
import { addr, publicClient } from "./config";
import { nameOf } from "./names";

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

export function getBalance(me: Address): Promise<bigint> {
  return publicClient.readContract({ address: addr.ausd, abi: erc20Abi, functionName: "balanceOf", args: [me] });
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
  return names.get(k)!.then((n) => (n ? `@${n}` : dir === "in" ? "Money received" : "Payment"));
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
const inflight = new Map<string, Promise<Item[]>>();

/** Newest-first payments to/from `me`. Safe to poll; concurrent calls share one scan. */
export function loadActivity(me: Address): Promise<Item[]> {
  const k = me.toLowerCase();
  if (!inflight.has(k)) inflight.set(k, scan(me).finally(() => inflight.delete(k)));
  return inflight.get(k)!;
}

async function scan(me: Address): Promise<Item[]> {
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

  return Promise.all(items.map(async (i) => ({ ...i, who: await who(i.other, i.dir), when: ago(i.time) })));
}
