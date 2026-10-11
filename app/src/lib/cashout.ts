"use client";
import { keccak256, toBytes, toHex, type Hex } from "viem";
import { FX } from "./money";

// Cash out: dollars settle through Agora (KinCashoutV2, lib/offramp.ts), then Onramp pays rupees to a UPI ID.
// Practice money settles on Agora's Instant Settlement pair for real; the rupee payout is the practice part.

export const UPI_RE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,64}$/i;

/** Onramp.money INR payout fee tiers (live sell config, Oct 2026): ₹2.36 ≤ ₹1k, ₹5.31 ≤ ₹25k, else ₹9.44. */
export const payoutFee = (inr: number) => (inr <= 1_000 ? 2.36 : inr <= 25_000 ? 5.31 : 9.44);
export const TDS = 0.01; // India: 1% tax deducted on selling digital dollars

/** Rupee breakdown for `dollars`. ponytail: rate from the app's FX table; Onramp's live quote replaces it when it answers. */
export function rupeesFor(dollars: number) {
  const rate = FX.INR;
  const gross = dollars * rate;
  const fee = payoutFee(gross);
  const tds = Math.round(gross * TDS * 100) / 100;
  return { rate, gross, fee, tds, inr: Math.max(0, gross - fee - tds) };
}

/** Payout reference stored on-chain: hash of a random salt + the UPI ID. Salted so the UPI ID (often a phone
 *  number) can't be brute-forced back from the event (audit). */
export const payoutRef = (upi: string): Hex =>
  keccak256(toBytes(`upi:${toHex(crypto.getRandomValues(new Uint8Array(32)))}:${upi.trim().toLowerCase()}`));

export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

// The UPI ID never goes on-chain (only its salted hash), so this phone remembers it per cash-out for Activity and
// the receipt. ponytail: localStorage per payment, like categories.
export type CashoutRecord = { upi: string; rupees: number; practice: boolean };
const key = (hash: string) => `kin.cashout.${hash.toLowerCase()}`;

export function saveCashout(hash: string, r: CashoutRecord) {
  try {
    localStorage.setItem(key(hash), JSON.stringify(r));
  } catch {}
}

export function cashoutOf(hash: string): CashoutRecord | null {
  try {
    return JSON.parse(localStorage.getItem(key(hash)) ?? "null") as CashoutRecord | null;
  } catch {
    return null;
  }
}
