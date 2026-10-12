import { isAddressEqual, parseEventLogs, type Address, type Hex } from "viem";
import { KinCircleAbi, KinEscrowAbi, KinGiftLinkAbi, KinMandateAbi, KinPotAbi, KinStreamAbi } from "./abi";
import { cashoutOf, inr } from "./cashout";
import { CASHOUT, CASHOUT_V1, addr, publicClient } from "./config";
import { nameOf, shortAddr } from "./names";

// Port of app/src/lib/counterparty.ts: money moving in/out of a Kin contract is a transfer to a contract
// address (no @name). Read the contract's own event in the same tx to say what it was for: "Bill for @b".

// ponytail: config.ts `addr` lacks these two; from contracts/deployments/10143.json.
const MANDATE: Address = "0xe770eCfBf2D2D6b8B9c1B210B7a42B92bbA8fd53";
const GIFTLINK: Address = "0x7ad1C20D0B96BaE5aE72462137384A1924e36BDb";
const ZERO = "0x0000000000000000000000000000000000000000";
const CHORE_MARK = 1;

const KIN = [addr.escrow, addr.stream, addr.pot, addr.circle, MANDATE, GIFTLINK, CASHOUT, CASHOUT_V1];
const isCashout = (a: Address) => isAddressEqual(a, CASHOUT) || isAddressEqual(a, CASHOUT_V1);
export const isKinContract = (a: Address) => KIN.some((k) => isAddressEqual(k, a));

const names = new Map<string, Promise<string>>();
const at = (a: Address) => {
  const k = a.toLowerCase();
  if (!names.has(k)) names.set(k, nameOf(a).then((n) => (n ? `@${n}` : shortAddr(a))).catch(() => shortAddr(a)));
  return names.get(k)!;
};

type EscrowKind = "invoice" | "gift" | "bill" | "reserve" | "chore" | "link";
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

// Same rules as web programs.kindOf.
async function escrow(id: bigint) {
  const [from, unlockAt, , , , to, autoApproveAt, approver] = await publicClient.readContract({ address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [id] });
  const kind: EscrowKind =
    to === ZERO ? "link" : autoApproveAt ? "invoice" : unlockAt === CHORE_MARK ? "chore" : unlockAt ? "gift" : isAddressEqual(approver, from) ? "reserve" : "bill";
  return { from, to, kind };
}

const cache = new Map<string, Promise<string>>();

/** Human description of a transfer between `me` and Kin contract `other` in tx `hash` ("out" = I paid in). */
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
  if (isAddressEqual(other, MANDATE)) return "AutoPay";
  if (isAddressEqual(other, GIFTLINK)) return "Gift link";
  if (isCashout(other)) return "Cash out";
  return "Kin";
}

async function read(hash: Hex, other: Address, dir: "in" | "out", me: Address): Promise<string> {
  if (isCashout(other)) {
    const rec = cashoutOf(hash); // rupees are remembered on this phone only (never on-chain)
    return rec ? `Cash out · ${inr(rec.rupees)}` : "Cash out";
  }
  const { logs } = await publicClient.getTransactionReceipt({ hash });
  const mine = logs.filter((l) => isAddressEqual(l.address, other));

  if (isAddressEqual(other, addr.escrow)) {
    const ev = parseEventLogs({ abi: KinEscrowAbi, logs: mine });
    if (ev.some((e) => e.eventName === "Refunded")) return "Returned to you";
    const id = ev.find((e) => e.eventName === "Created" || e.eventName === "Released")?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const e = await escrow(id);
    return dir === "out" ? ESCROW_OUT[e.kind](await at(e.to)) : ESCROW_IN[e.kind](await at(e.from));
  }

  if (isAddressEqual(other, addr.stream)) {
    const ev = parseEventLogs({ abi: KinStreamAbi, logs: mine });
    const created = ev.find((e) => e.eventName === "StreamCreated");
    if (created && created.eventName === "StreamCreated") return `Allowance for ${await at(created.args.payee)}`;
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const [payer] = await publicClient.readContract({ address: addr.stream, abi: KinStreamAbi, functionName: "streams", args: [id] });
    return isAddressEqual(payer, me) ? "Allowance returned" : `Allowance from ${await at(payer)}`;
  }

  if (isAddressEqual(other, addr.pot)) {
    const ev = parseEventLogs({ abi: KinPotAbi, logs: mine });
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const [[, , , , toAll], members, beneficiaries] = await Promise.all([
      publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "pots", args: [id] }),
      publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "membersOf", args: [id] }),
      publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "beneficiariesOf", args: [id] }),
    ]);
    const jar = !toAll && members.length === 1 && beneficiaries.length === 1 && isAddressEqual(members[0], beneficiaries[0]);
    if (jar) return dir === "out" ? "Savings jar" : ev.some((e) => e.eventName === "PotPaid") ? "Savings goal reached" : "From your savings jar";
    if (dir === "in") return "Family pot payout";
    if (toAll) return "Family pot for everyone";
    const extra = beneficiaries.length > 1 ? ` +${beneficiaries.length - 1}` : "";
    return `Family pot for ${await at(beneficiaries[0])}${extra}`;
  }

  if (isAddressEqual(other, addr.circle)) {
    const ev = new Set(parseEventLogs({ abi: KinCircleAbi, logs: mine }).map((e) => e.eventName));
    if (dir === "out") return ev.has("Joined") ? "Circle safety deposit" : "Savings circle";
    if (ev.has("PaidOut")) return "Circle payout — your turn";
    if (ev.has("DepositReturned") || ev.has("Left")) return "Circle deposit back";
    if (ev.has("ForfeitShared")) return "Circle share";
    return "Savings circle";
  }

  if (isAddressEqual(other, MANDATE)) {
    const ev = parseEventLogs({ abi: KinMandateAbi, logs: mine });
    const created = ev.find((e) => e.eventName === "MandateCreated");
    if (created && created.eventName === "MandateCreated") return `AutoPay to ${await at(created.args.payee)}`;
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const [payer] = await publicClient.readContract({ address: MANDATE, abi: KinMandateAbi, functionName: "mandates", args: [id] });
    return isAddressEqual(payer, me) ? "AutoPay refund" : `AutoPay from ${await at(payer)}`;
  }

  if (isAddressEqual(other, GIFTLINK)) {
    const ev = parseEventLogs({ abi: KinGiftLinkAbi, logs: mine });
    if (ev.some((e) => e.eventName === "Refunded")) return "Gift returned";
    const id = ev[0]?.args.id as bigint | undefined;
    if (id === undefined) return fallback(other);
    const [from, , , , recipient] = await publicClient.readContract({ address: GIFTLINK, abi: KinGiftLinkAbi, functionName: "gifts", args: [id] });
    if (dir === "in") return `Gift from ${await at(from)}`;
    return recipient === ZERO ? "Gift link" : `Gift link for ${await at(recipient)}`;
  }

  return fallback(other);
}
