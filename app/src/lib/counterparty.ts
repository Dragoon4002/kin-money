"use client";
import { isAddressEqual, parseEventLogs, type Address, type Hex } from "viem";
import { KinCircleAbi, KinEscrowAbi, KinGiftLinkAbi, KinMandateAbi, KinPotAbi, KinStreamAbi } from "./abi";
import { addr, publicClient } from "./chain";
import { nameOf, shortAddr } from "./names";
import { getEscrow, getPot, getStream, isJar, ZERO, type EscrowKind } from "./programs";

// Money moving in/out of a Kin contract (escrow, allowance, pot, circle, AutoPay) is a transfer to a
// contract address, which has no @name. This turns it into what the payment was *for*, read from the
// contract's own event in the same transaction: "Chore for @b", "Allowance from @mum", "Savings jar"…

const KIN = (a: Address) =>
  [addr.escrow, addr.stream, addr.pot, addr.circle, addr.mandate, addr.giftlink].some((k) => isAddressEqual(k, a));
export const isKinContract = KIN;

const names = new Map<string, Promise<string>>();
const at = (a: Address) => {
  const k = a.toLowerCase();
  if (!names.has(k)) names.set(k, nameOf(a).then((n) => (n ? `@${n}` : shortAddr(a))).catch(() => shortAddr(a)));
  return names.get(k)!;
};

const ESCROW_OUT: Record<EscrowKind, (to: string) => string> = {
  link: () => "Payment link",
  chore: (to) => `Chore for ${to}`,
  gift: (to) => `Gift for ${to}`,
  bill: (to) => `Bill for ${to}`,
  invoice: (to) => `Invoice to ${to}`,
  reserve: (to) => `Emergency fund for ${to}`,
};
const ESCROW_IN: Record<EscrowKind, (from: string) => string> = {
  link: (f) => `Link from ${f}`,
  chore: (f) => `Chore reward from ${f}`,
  gift: (f) => `Gift from ${f}`,
  bill: (f) => `Bill paid by ${f}`,
  invoice: (f) => `Invoice paid by ${f}`,
  reserve: (f) => `Emergency money from ${f}`,
};

const cache = new Map<string, Promise<string>>();

/**
 * Human description of a transfer between `me` and a Kin contract in tx `hash`.
 * `dir` is from my side: "out" = I paid into the contract, "in" = the contract paid me.
 */
export function describe(hash: Hex, other: Address, dir: "in" | "out", me: Address): Promise<string> {
  const k = `${hash}:${other.toLowerCase()}:${dir}:${me.toLowerCase()}`;
  if (!cache.has(k)) cache.set(k, read(hash, other, dir, me).catch(() => fallback(other)));
  return cache.get(k)!;
}

function fallback(other: Address): string {
  if (isAddressEqual(other, addr.escrow)) return "Held safely";
  if (isAddressEqual(other, addr.stream)) return "Allowance";
  if (isAddressEqual(other, addr.pot)) return "Family pot";
  if (isAddressEqual(other, addr.circle)) return "Savings circle";
  if (isAddressEqual(other, addr.mandate)) return "AutoPay";
  if (isAddressEqual(other, addr.giftlink)) return "Gift link";
  return "Kin";
}

async function read(hash: Hex, other: Address, dir: "in" | "out", me: Address): Promise<string> {
  const { logs } = await publicClient.getTransactionReceipt({ hash });
  const mine = logs.filter((l) => isAddressEqual(l.address, other));

  if (isAddressEqual(other, addr.escrow)) {
    const ev = parseEventLogs({ abi: KinEscrowAbi, logs: mine });
    const created = ev.find((e) => e.eventName === "Created");
    const released = ev.find((e) => e.eventName === "Released");
    const refunded = ev.find((e) => e.eventName === "Refunded");
    if (refunded) return "Returned to you";
    const id = (created ?? released)?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const e = await getEscrow(id);
    return dir === "out" ? ESCROW_OUT[e.kind](await at(e.to)) : ESCROW_IN[e.kind](await at(e.from));
  }

  if (isAddressEqual(other, addr.stream)) {
    const ev = parseEventLogs({ abi: KinStreamAbi, logs: mine });
    const created = ev.find((e) => e.eventName === "StreamCreated");
    if (created && created.eventName === "StreamCreated") return `Allowance for ${await at(created.args.payee)}`;
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const s = await getStream(id);
    // Collect, or the payee's share on stop → from the payer; the payer's leftover on stop → returned.
    return isAddressEqual(s.payer, me) ? "Allowance returned" : `Allowance from ${await at(s.payer)}`;
  }

  if (isAddressEqual(other, addr.pot)) {
    const ev = parseEventLogs({ abi: KinPotAbi, logs: mine });
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const p = await getPot(id);
    if (isJar(p)) return dir === "out" ? "Savings jar" : ev.some((e) => e.eventName === "PotPaid") ? "Savings goal reached" : "From your savings jar";
    if (dir === "in") return "Family pot payout";
    if (p.toAll) return "Family pot for everyone";
    const extra = p.beneficiaries.length > 1 ? ` +${p.beneficiaries.length - 1}` : "";
    return `Family pot for ${await at(p.beneficiaries[0])}${extra}`;
  }

  if (isAddressEqual(other, addr.circle)) {
    const ev = parseEventLogs({ abi: KinCircleAbi, logs: mine });
    const names = new Set(ev.map((e) => e.eventName));
    if (dir === "out") return names.has("Joined") ? "Circle safety deposit" : "Savings circle";
    if (names.has("PaidOut")) return "Circle payout — your turn";
    if (names.has("DepositReturned") || names.has("Left")) return "Circle deposit back";
    if (names.has("ForfeitShared")) return "Circle share";
    return "Savings circle";
  }

  if (isAddressEqual(other, addr.mandate)) {
    const ev = parseEventLogs({ abi: KinMandateAbi, logs: mine });
    const created = ev.find((e) => e.eventName === "MandateCreated");
    if (created && created.eventName === "MandateCreated") return `AutoPay to ${await at(created.args.payee)}`;
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const m = await publicClient.readContract({ address: addr.mandate, abi: KinMandateAbi, functionName: "mandates", args: [id] });
    const [payer] = m;
    return isAddressEqual(payer, me) ? "AutoPay refund" : `AutoPay from ${await at(payer)}`;
  }

  if (isAddressEqual(other, addr.giftlink)) {
    const ev = parseEventLogs({ abi: KinGiftLinkAbi, logs: mine });
    if (ev.some((e) => e.eventName === "Refunded")) return "Gift returned";
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const [from, , , , recipient] = await publicClient.readContract({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "gifts", args: [id] });
    if (dir === "in") return `Gift from ${await at(from)}`;
    return recipient === ZERO ? "Gift link" : `Gift link for ${await at(recipient)}`;
  }

  return fallback(other);
}
