"use client";
import { keccak256, parseAbi, toBytes, toHex, type Address, type Hex } from "viem";
import { KinCashoutAbi } from "./abi";
import { addr, publicClient } from "./chain";
import { FX } from "./money";
import { call } from "./tx";

// Cash out (practice network): dollars settle through Agora Instant Settlement at Agora's fixed price
// (KinCashout → AUSD/CTK pair), then the payout desk pays the UPI ID. The rupee payout itself is the
// practice part — no bank partner yet. Real money path (later): LayerZero bridge → INR partner.

const pairAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
const AGORA_PAIR = "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae"; // Agora Instant Settlement, Monad testnet

export const UPI_RE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,64}$/i;

/** Onramp.money INR payout fee tiers (live sell config, Oct 2026): ₹2.36 ≤ ₹1k, ₹5.31 ≤ ₹25k, else ₹9.44. */
export const payoutFee = (inr: number) => (inr <= 1_000 ? 2.36 : inr <= 25_000 ? 5.31 : 9.44);
export const TDS = 0.01; // India: 1% tax deducted on selling digital dollars

export type Quote = { units: bigint; settled: bigint; rate: number; gross: number; fee: number; tds: number; inr: number };

/** Live fixed-price quote from Agora's pair + INR breakdown. ponytail: INR rate from the app's FX table, not a live feed. */
export async function quote(units: bigint): Promise<Quote> {
  const [t0, t1] = await Promise.all([
    publicClient.readContract({ address: AGORA_PAIR, abi: pairAbi, functionName: "token0" }),
    publicClient.readContract({ address: AGORA_PAIR, abi: pairAbi, functionName: "token1" }),
  ]);
  const path = t1.toLowerCase() === addr.ausd.toLowerCase() ? [t1, t0] : [t0, t1];
  const [, settled] = await publicClient.readContract({ address: AGORA_PAIR, abi: pairAbi, functionName: "getAmountsOut", args: [units, path] });
  const rate = FX.INR;
  const gross = (Number(units) / 1e6) * rate;
  const fee = payoutFee(gross);
  const tds = Math.round(gross * TDS * 100) / 100;
  return { units, settled, rate, gross, fee, tds, inr: Math.max(0, gross - fee - tds) };
}

/** Payout reference stored on-chain: hash of a random salt + the UPI ID. Salted so the UPI ID (often a phone
 *  number) can't be brute-forced back from the event (audit). */
export const payoutRef = (upi: string): Hex =>
  keccak256(toBytes(`upi:${toHex(crypto.getRandomValues(new Uint8Array(32)))}:${upi.trim().toLowerCase()}`));

/** Sell `q.units` dollars through Agora Instant Settlement (gasless, one Identity check). The settled tokens go
 *  straight to `to` (the user's own account here; an off-ramp partner's deposit address on mainnet). */
export function cashOut(q: Quote, upi: string, to: Address): Promise<Hex> {
  // Fixed price: allow 0.5% slack in case Agora nudges the price between quote and confirm.
  return call(addr.cashout, KinCashoutAbi, "cashOut", [to, (q.settled * 995n) / 1000n, payoutRef(upi)], { fund: q.units });
}

export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
