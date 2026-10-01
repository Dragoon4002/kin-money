"use client";
import { erc20Abi, isAddressEqual, parseEventLogs, type Address, type Hex } from "viem";
import { addr, publicClient } from "./chain";
import { describe, isKinContract } from "./counterparty";
import { nameOf } from "./names";
import { history } from "./programs";

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

export function getBalance(me: Address): Promise<bigint> {
  return publicClient.readContract({ address: addr.ausd, abi: erc20Abi, functionName: "balanceOf", args: [me] });
}

const names = new Map<string, Promise<string>>();
function who(other: Address, dir: Item["dir"], hash: Hex, me: Address): Promise<string> {
  // Kin contracts (allowance, pot, escrow…): say what the money was for ("Chore for @b").
  if (isKinContract(other)) return describe(hash, other, dir, me);
  // Testnet faucet (Agora) that funds the welcome gift on sign-up.
  if (isAddressEqual(other, "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C")) return Promise.resolve("Welcome money");
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

const last = new Map<string, Item[]>();

async function scan(me: Address): Promise<Item[]> {
  const k = me.toLowerCase();
  try {
    const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: await history(addr.ausd, me) });
    const found = logs.flatMap((log) => {
      const { from, to, value } = log.args;
      const out = isAddressEqual(from, me);
      if (!out && !isAddressEqual(to, me)) return [];
      const time = log.blockTimestamp ? Number(log.blockTimestamp) * 1000 : Date.now();
      return [{ hash: log.transactionHash, logIndex: log.logIndex, dir: out ? "out" : "in", other: out ? to : from, amount: value, time } as const];
    });
    const items = await Promise.all(found.reverse().slice(0, KEEP).map(async (i) => ({ ...i, who: await who(i.other, i.dir, i.hash, me), when: ago(i.time) })));
    last.set(k, items);
    return items;
  } catch (e) {
    // ponytail: offline or rate-limited — keep showing the last good list.
    if (last.has(k)) return last.get(k)!;
    throw e;
  }
}
