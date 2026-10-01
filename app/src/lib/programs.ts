"use client";
import { parseEventLogs, type Abi, type Address, type Hex } from "viem";
import { KinCircleAbi, KinEscrowAbi, KinPotAbi, KinStreamAbi } from "./abi";
import { addr, publicClient } from "./chain";

// Readers for programmable money (allowance, reserves, bills, invoices, gifts, pots, circles).
// Listing = enumerate ids 1..count() with multicall (public Monad RPCs cap getLogs at 100 blocks).
// Logs only feed recent extras (emergency asks, circle/pot history) over a short window.

// ponytail: ~15 min of log history; swap for Envio HyperSync if older asks/history matter.
const WINDOW = 3_000n;
const MIN_CHUNK = 100n;
let chunk = MIN_CHUNK;
// ponytail: scans newest MAX_IDS records per contract; add an indexer when usage outgrows it.
const MAX_IDS = 400n;

type Kin = typeof KinStreamAbi | typeof KinEscrowAbi | typeof KinPotAbi | typeof KinCircleAbi;

/** Ids newest-first, read in one multicall, keeping rows where `keep` is true. */
async function scan<R>(address: Address, abi: Kin, fn: string, keep: (row: R) => boolean): Promise<[bigint, R][]> {
  const count = (await publicClient.readContract({ address, abi: abi as typeof KinPotAbi, functionName: "count" })) as bigint;
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < MAX_IDS; i--) ids.push(i);
  const rows = await publicClient.multicall({
    contracts: ids.map((id) => ({ address, abi, functionName: fn, args: [id] }) as never),
    allowFailure: false,
  });
  return ids.map((id, i) => [id, rows[i] as R] as [bigint, R]).filter(([, r]) => keep(r));
}
const BATCH = 8;

export const nowSec = () => Math.floor(Date.now() / 1000);
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

async function rawLogs(address: Address, from: bigint, to: bigint) {
  for (;;) {
    try {
      const parts: [bigint, bigint][] = [];
      for (let a = from; a <= to; a += chunk) parts.push([a, a + chunk - 1n < to ? a + chunk - 1n : to]);
      const out = [];
      for (let i = 0; i < parts.length; i += BATCH) {
        const got = await Promise.all(parts.slice(i, i + BATCH).map(([fromBlock, toBlock]) => publicClient.getLogs({ address, fromBlock, toBlock })));
        out.push(...got.flat());
      }
      return out;
    } catch (e) {
      if (chunk <= MIN_CHUNK) throw e;
      chunk = chunk / 10n < MIN_CHUNK ? MIN_CHUNK : chunk / 10n;
    }
  }
}

const cache = new Map<Address, { to: bigint; logs: Awaited<ReturnType<typeof rawLogs>> }>();

/** Every event of a Kin contract in the recent window, decoded, oldest first. */
async function events<const abi extends Abi>(address: Address, abi: abi) {
  const latest = await publicClient.getBlockNumber();
  const hit = cache.get(address);
  const from = hit ? hit.to + 1n : latest > WINDOW ? latest - WINDOW : 0n;
  const fresh = from <= latest ? await rawLogs(address, from, latest) : [];
  const logs = [...(hit?.logs ?? []), ...fresh];
  cache.set(address, { to: latest, logs });
  return parseEventLogs({ abi, logs });
}

/** Id emitted by the create call in tx `hash`. */
export async function createdId<const abi extends Abi>(hash: Hex, abi: abi, eventName: string): Promise<bigint> {
  const r = await publicClient.getTransactionReceipt({ hash });
  const ev = parseEventLogs({ abi, logs: r.logs }).find((l) => l.eventName === eventName) as { args: { id: bigint } } | undefined;
  if (!ev) throw new Error("created event missing");
  return ev.args.id;
}

/** Decoded events in tx `hash` (e.g. PotPaid after contribute). */
export async function txEvents<const abi extends Abi>(hash: Hex, abi: abi) {
  const r = await publicClient.getTransactionReceipt({ hash });
  return parseEventLogs({ abi, logs: r.logs });
}

// ---------- Allowance (KinStream) ----------

export type Stream = { id: bigint; payer: Address; payee: Address; start: number; end: number; amount: bigint; withdrawn: bigint };

export async function getStream(id: bigint): Promise<Stream> {
  const [payer, start, end, payee, amount, withdrawn] = await publicClient.readContract({ address: addr.stream, abi: KinStreamAbi, functionName: "streams", args: [id] });
  return { id, payer, payee, start, end, amount, withdrawn };
}

type StreamRow = readonly [Address, number, number, Address, bigint, bigint];

export async function listStreams(me: Address): Promise<Stream[]> {
  const rows = await scan<StreamRow>(addr.stream, KinStreamAbi, "streams", (r) => same(r[0], me) || same(r[3], me));
  return rows.map(([id, [payer, start, end, payee, amount, withdrawn]]) => ({ id, payer, payee, start, end, amount, withdrawn }));
}

/** Earned so far at time `t` (seconds, may be fractional), in base units as a float for smooth display. */
export function vestedAt(s: Stream, t: number): number {
  if (t >= s.end) return Number(s.amount);
  if (t <= s.start) return 0;
  return (Number(s.amount) * (t - s.start)) / (s.end - s.start);
}

/** Collectable right now (exact, matches contract `accrued`). */
export function accrued(s: Stream, t = nowSec()): bigint {
  const vested = t >= s.end ? s.amount : (s.amount * BigInt(Math.max(0, t - s.start))) / BigInt(s.end - s.start);
  return vested - s.withdrawn;
}

// ---------- Held money (KinEscrow) ----------

export type EscrowKind = "invoice" | "gift" | "bill" | "reserve" | "chore" | "link";
export type Escrow = {
  id: bigint; from: Address; to: Address; approver: Address; amount: bigint;
  unlockAt: number; expiresAt: number; autoApproveAt: number; approved: boolean; settled: boolean;
  kind: EscrowKind;
};

// Kind is encoded in the terms (see create calls in app/*): invoice=autoApproveAt, gift=unlockAt (a real date),
// chore=unlockAt CHORE_MARK, reserve=sender OKs it themselves, bill=someone else (or no one) OKs it.
// Chores and reserves share terms (to=kid, approver=parent), so chores carry an onchain marker both
// phones can read: unlockAt = 1 (always in the past, so it never delays payout; no gift picks 1970).
export const CHORE_MARK = 1;
function kindOf(e: Omit<Escrow, "kind">): EscrowKind {
  if (e.to === ZERO) return "link";
  if (e.autoApproveAt) return "invoice";
  if (e.unlockAt === CHORE_MARK) return "chore";
  if (e.unlockAt) return "gift";
  return same(e.approver, e.from) ? "reserve" : "bill";
}

/** Approver-gated money must be refundable eventually; 30 days after it could first be paid. */
export const HOLD_DAYS = 30;
export const expiryAfter = (t: number) => t + HOLD_DAYS * 86_400;

export async function getEscrow(id: bigint): Promise<Escrow> {
  const [from, unlockAt, expiresAt, approved, settled, to, autoApproveAt, approver, amount] = await publicClient.readContract({ address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [id] });
  const e = { id, from, to, approver, amount, unlockAt, expiresAt, autoApproveAt, approved, settled };
  return { ...e, kind: kindOf(e) };
}

/** Escrows where I send, receive or must OK, plus which ones the payee has asked to release. */
export async function listEscrows(me: Address, kind?: EscrowKind) {
  type Row = readonly [Address, number, number, boolean, boolean, Address, number, Address, bigint, Address];
  const [rows, evs] = await Promise.all([
    scan<Row>(addr.escrow, KinEscrowAbi, "escrows", (r) => same(r[0], me) || same(r[5], me) || same(r[7], me)),
    events(addr.escrow, KinEscrowAbi).catch(() => []),
  ]);
  const pinged = new Map<bigint, number>(); // id -> count of recent asks
  for (const l of evs) if (l.eventName === "Requested") pinged.set(l.args.id, (pinged.get(l.args.id) ?? 0) + 1);
  const all = rows.map(([id, [from, unlockAt, expiresAt, approved, settled, to, autoApproveAt, approver, amount]]) => {
    const e = { id, from, to, approver, amount, unlockAt, expiresAt, autoApproveAt, approved, settled };
    return { ...e, kind: kindOf(e) };
  });
  return { escrows: all.filter((e) => !kind || e.kind === kind), pinged };
}

/** True when `release` would succeed now. */
export function canRelease(e: Escrow, t = nowSec()): boolean {
  return !e.settled && e.to !== ZERO && t >= e.unlockAt && (e.approver === ZERO || e.approved || (!!e.autoApproveAt && t >= e.autoApproveAt));
}

// ---------- Family pot (KinPot) ----------

export type Pot = { id: bigint; beneficiary: Address; target: bigint; balance: bigint; round: bigint; closed: boolean; members: Address[]; creator: Address };

export async function getPot(id: bigint): Promise<Pot & { mine: Map<Address, bigint> }> {
  const [[beneficiary, target, balance, round, closed], members] = await Promise.all([
    publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "pots", args: [id] }),
    publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "membersOf", args: [id] }),
  ]);
  const amounts = await Promise.all(members.map((m) => publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "contributed", args: [id, round, m] })));
  return { id, beneficiary, target, balance, round, closed, members: [...members], creator: ZERO, mine: new Map(members.map((m, i) => [m, amounts[i]])) };
}

export async function listPots(me: Address): Promise<Pot[]> {
  type Row = readonly [Address, bigint, bigint, bigint, boolean];
  const rows = await scan<Row>(addr.pot, KinPotAbi, "pots", () => true);
  const members = await publicClient.multicall({
    contracts: rows.map(([id]) => ({ address: addr.pot, abi: KinPotAbi, functionName: "membersOf", args: [id] }) as const),
    allowFailure: false,
  });
  return rows.flatMap(([id, [beneficiary, target, balance, round, closed]], i) =>
    same(beneficiary, me) || members[i].some((m) => same(m, me))
      ? [{ id, beneficiary, target, balance, round, closed, members: [...members[i]], creator: ZERO }]
      : [],
  );
}

/** Savings jar = a pot I save into for myself (only member is the beneficiary). Not a family pot. */
export const isJar = (p: Pick<Pot, "beneficiary" | "members">) => p.members.length === 1 && same(p.members[0], p.beneficiary);

/** Recent adds to pot `id`, newest first (jar entries). */
export async function potAdds(id: bigint) {
  return (await events(addr.pot, KinPotAbi)).flatMap((l) => (l.eventName === "Contributed" && l.args.id === id ? [l.args] : [])).reverse();
}

/** Past payouts of pot `id` (for "Paid N times" history). */
export async function potPayouts(id: bigint) {
  return (await events(addr.pot, KinPotAbi)).flatMap((l) => (l.eventName === "PotPaid" && l.args.id === id ? [l.args] : []));
}

// ---------- Savings circle (KinCircle) ----------

export type CircleMember = { address: Address; joined: boolean; defaulted: boolean; paidRound: number; deposit: bigint; depositFor: bigint };
export type Circle = {
  id: bigint; contribution: bigint; roundLength: number; roundStart: number; round: number;
  joined: number; paidCount: number; pot: bigint; joinBy: number; members: CircleMember[];
};

export async function getCircle(id: bigint): Promise<Circle> {
  const [[contribution, roundLength, roundStart, round, joined, paidCount, pot, , joinBy], addrs] = await Promise.all([
    publicClient.readContract({ address: addr.circle, abi: KinCircleAbi, functionName: "circles", args: [id] }),
    publicClient.readContract({ address: addr.circle, abi: KinCircleAbi, functionName: "membersOf", args: [id] }),
  ]);
  const [infos, deposits] = await Promise.all([
    Promise.all(addrs.map((m) => publicClient.readContract({ address: addr.circle, abi: KinCircleAbi, functionName: "memberInfo", args: [id, m] }))),
    Promise.all(addrs.map((m) => publicClient.readContract({ address: addr.circle, abi: KinCircleAbi, functionName: "depositFor", args: [id, m] }))),
  ]);
  const members = addrs.map((address, i) => {
    const [, joined, defaulted, , paidRound, deposit] = infos[i];
    return { address, joined, defaulted, paidRound, deposit, depositFor: deposits[i] };
  });
  return { id, contribution, roundLength, roundStart, round, joined, paidCount, pot, joinBy, members };
}

export type CirclePhase = "gathering" | "stalled" | "running" | "done";
export function circlePhase(c: Circle, t = nowSec()): CirclePhase {
  if (c.roundStart === 0) return t >= c.joinBy ? "stalled" : "gathering";
  return c.round >= c.members.length ? "done" : "running";
}

/** Anyone may close the round once time is up, or early if everyone could pay and did. */
export function canSettle(c: Circle, t = nowSec()): boolean {
  return circlePhase(c, t) === "running" && (c.paidCount >= c.members.length || t >= c.roundStart + c.roundLength);
}

export async function listCircles(me: Address) {
  const count = await publicClient.readContract({ address: addr.circle, abi: KinCircleAbi, functionName: "count" });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < MAX_IDS; i--) ids.push(i);
  const infos = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: addr.circle, abi: KinCircleAbi, functionName: "memberInfo", args: [id, me] }) as const),
    allowFailure: false,
  });
  return Promise.all(ids.filter((_, i) => infos[i][0]).map(getCircle));
}

/** Payouts, defaults and end-of-circle outcomes for circle `id`, oldest first. */
export async function circleHistory(id: bigint) {
  return (await events(addr.circle, KinCircleAbi)).filter(
    (l) => ["PaidOut", "Defaulted", "Forfeited", "DepositReturned", "ForfeitShared"].includes(l.eventName) && (l.args as { id: bigint }).id === id,
  );
}

export { same };
