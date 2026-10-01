"use client";
import type { Address } from "viem";
import { KinMandateAbi } from "./abi";
import { addr, publicClient } from "./chain";
import { nowSec, same } from "./programs";

// AutoPay (KinMandate): payer pre-funds N payments; payment k is due at start + k*period.

export type Mandate = {
  id: bigint; payer: Address; payee: Address; start: number; period: number;
  periods: number; amount: bigint; paid: number;
};

type Row = readonly [Address, number, number, number, Address, bigint, number];
const toMandate = (id: bigint, [payer, start, period, periods, payee, amount, paid]: Row): Mandate => ({ id, payer, payee, start, period, periods, amount, paid });

export async function getMandate(id: bigint): Promise<Mandate> {
  return toMandate(id, await publicClient.readContract({ address: addr.mandate, abi: KinMandateAbi, functionName: "mandates", args: [id] }));
}

// ponytail: scans newest 400 ids like programs.ts; add an indexer when usage outgrows it.
const MAX_IDS = 400n;

/** Mandates where I pay or get paid, newest first. */
export async function listMandates(me: Address): Promise<Mandate[]> {
  const count = await publicClient.readContract({ address: addr.mandate, abi: KinMandateAbi, functionName: "count" });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < MAX_IDS; i--) ids.push(i);
  const rows = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: addr.mandate, abi: KinMandateAbi, functionName: "mandates", args: [id] }) as const),
    allowFailure: false,
  });
  return ids.map((id, i) => toMandate(id, rows[i])).filter((m) => same(m.payer, me) || same(m.payee, me));
}

/** Payments due now and unpaid (matches contract `due`). */
export function dueCount(m: Mandate, t = nowSec()): number {
  return Math.min(Math.floor(Math.max(0, t - m.start) / m.period), m.periods) - m.paid;
}

export const isDone = (m: Mandate) => m.paid >= m.periods;

/** When the next unpaid payment falls due (may be in the past if waiting to be collected). */
export const nextDue = (m: Mandate) => m.start + (m.paid + 1) * m.period;

export const DAY = 86_400;
export const EVERY = [
  { value: 7 * DAY, label: "Weekly", unit: "week", wait: "a week" },
  { value: 30 * DAY, label: "Monthly", unit: "month", wait: "a month" },
  { value: 300, label: "Demo: 5 min", unit: "5 minutes", wait: "5 minutes" },
];
/** "month" in "every month". */
export const unitOf = (period: number) => EVERY.find((e) => e.value === period)?.unit ?? `${Math.round(period / DAY)} days`;
