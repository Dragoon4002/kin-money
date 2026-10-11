"use client";
import { erc20Abi, formatLog, isAddressEqual, parseEventLogs, type Address, type Hex, type RpcLog } from "viem";
import { addr, getMode, money, publicClient } from "./chain";
import { describe, isKinContract } from "./counterparty";
import { nameOf, shortAddr } from "./names";
import { history, rawLogs, TAIL } from "./programs";

// Activity feed from AUSD Transfer logs since deploy (server-side history + live tail, see programs.history).
const KEEP = 100;

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

/** Balance in the current mode (practice or real money). */
export function getBalance(me: Address): Promise<bigint> {
  const net = money();
  return net.client.readContract({ address: net.ausd, abi: erc20Abi, functionName: "balanceOf", args: [me] });
}

/** Real money: this person's dollar transfers on mainnet (server HyperSync query). */
async function mainHistory(me: Address) {
  const r = await fetch(`/api/history?kind=transfers&net=main&address=${me}`);
  if (!r.ok) throw new Error("history unavailable");
  return ((await r.json()) as { logs: RpcLog[] }).logs.map((l) => formatLog(l));
}

const names = new Map<string, Promise<string>>();
function who(other: Address, dir: Item["dir"], hash: Hex, me: Address): Promise<string> {
  // Kin contracts (allowance, pot, escrow…): say what the money was for ("Chore for @b").
  if (isKinContract(other)) return describe(hash, other, dir, me);
  // Testnet faucet (Agora) that funds the welcome gift on sign-up.
  if (isAddressEqual(other, "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C")) return Promise.resolve("Welcome money");
  const k = other.toLowerCase();
  if (!names.has(k)) names.set(k, nameOf(other).catch(() => ""));
  return names.get(k)!.then((n) => (n ? `@${n}` : shortAddr(other)));
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

type Raw = Omit<Item, "who" | "when">;
const key = (me: Address) => `${getMode()}:${me.toLowerCase()}`;
const lastRaw = new Map<string, Raw[]>(); // memory only, never browser storage
const rawInflight = new Map<string, Promise<Raw[]>>();

/** Newest-first payments to/from `me`, unlabelled (one history call). Concurrent calls share it. */
export function payments(me: Address): Promise<Raw[]> {
  const k = key(me);
  if (!rawInflight.has(k)) rawInflight.set(k, fetchPayments(me, k).finally(() => rawInflight.delete(k)));
  return rawInflight.get(k)!;
}

/** Last payments loaded this session for `me` in the current mode (no fetch). */
export const cachedPayments = (me: Address): Raw[] | null => lastRaw.get(key(me)) ?? null;

/**
 * Practice money, fast path: newest payments from Envio HyperIndex (/api/activity, names included) + a live tail of
 * blocks the indexer hasn't reached. Throws when the indexer is down or too far behind → caller uses full history.
 */
async function indexedPayments(me: Address): Promise<Raw[]> {
  const [res, latest] = await Promise.all([
    fetch(`/api/activity?address=${me}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("index unavailable")))),
    publicClient.getBlockNumber(),
  ]);
  const { payments, names: known, head } = res as {
    payments: { hash: Hex; logIndex: number; from: Address; to: Address; value: string; time: number }[];
    names: Record<string, string>;
    head: number;
  };
  // Behind, or nothing indexed (accounts without an @name aren't tracked): full history instead.
  if (head < 0 || latest - BigInt(head) > TAIL || !payments.length) throw new Error("index behind");
  for (const [a, n] of Object.entries(known)) if (!names.has(a)) names.set(a, Promise.resolve(n));
  const tail = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: await rawLogs(addr.ausd, BigInt(head) + 1n, latest) });
  const seen = new Set(payments.map((p) => `${p.hash}:${p.logIndex}`));
  const fresh = tail
    .filter((l) => (isAddressEqual(l.args.from, me) || isAddressEqual(l.args.to, me)) && !seen.has(`${l.transactionHash}:${l.logIndex}`))
    .map((l) => ({ hash: l.transactionHash, logIndex: l.logIndex, from: l.args.from, to: l.args.to, value: l.args.value, time: Date.now() / 1000 }))
    .reverse();
  return [...fresh, ...payments].map((p) => {
    const out = isAddressEqual(p.from, me);
    return { hash: p.hash, logIndex: p.logIndex, dir: out ? "out" : "in", other: out ? p.to : p.from, amount: BigInt(p.value), time: p.time * 1000 } as const;
  });
}

async function fetchPayments(me: Address, k: string): Promise<Raw[]> {
  if (getMode() === "test") {
    const raw = await indexedPayments(me).catch(() => null);
    if (raw) return lastRaw.set(k, raw), raw;
  }
  try {
    const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: getMode() === "main" ? await mainHistory(me) : await history(addr.ausd, me) });
    const found = logs.flatMap((log) => {
      const { from, to, value } = log.args;
      const out = isAddressEqual(from, me);
      if (!out && !isAddressEqual(to, me)) return [];
      const time = log.blockTimestamp ? Number(log.blockTimestamp) * 1000 : Date.now();
      return [{ hash: log.transactionHash, logIndex: log.logIndex, dir: out ? "out" : "in", other: out ? to : from, amount: value, time } as const];
    });
    const raw = found.reverse();
    lastRaw.set(k, raw);
    return raw;
  } catch (e) {
    // ponytail: offline or rate-limited — keep showing the last good list.
    if (lastRaw.has(k)) return lastRaw.get(k)!;
    throw e;
  }
}

/** Names/labels for a slice of payments (cached per address/tx, so relabelling a longer slice is cheap). */
export const label = (raw: Raw[], me: Address): Promise<Item[]> =>
  Promise.all(raw.map(async (i) => ({ ...i, who: await who(i.other, i.dir, i.hash, me), when: ago(i.time) })));

/** Newest KEEP payments, labelled (Spends). */
export const loadActivity = async (me: Address): Promise<Item[]> => label((await payments(me)).slice(0, KEEP), me);
