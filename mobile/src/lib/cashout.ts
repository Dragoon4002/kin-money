import * as SecureStore from "expo-secure-store";
import { encodeAbiParameters, formatUnits, isAddressEqual, keccak256, parseAbi, parseEventLogs, toBytes, toHex, type Address, type Hex } from "viem";
import { trackKey } from "./account";
import { addr, API_BASE, CASHOUT, chain, publicClient } from "./config";
import { FX } from "./money";
import { cashOutSigned } from "./tx";

// Port of app/src/lib/{cashout,cashoutRoutes,offramp,onrampWidget}.ts (practice network) — keep in sync.
// Cash out: AUSD → USDC through Agora (KinCashoutV2, Instant Settlement pair), then USDC → INR through Onramp.
// The Agora leg is real (testnet, Agora's test USDC); the rupee payout is the practice part.

const AGORA_PAIR: Address = "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae"; // Agora Instant Settlement, Monad testnet
const SETTLE = { address: "0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D" as Address, decimals: 18 }; // Agora test USDC (CTK)
const AGORA_VENUE = 0; // KinCashoutV2.Venue.Agora

const pairAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function hasRole(string role, address account) view returns (bool)",
]);
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** Onramp.money INR payout fee tiers (live sell config, Oct 2026): ₹2.36 ≤ ₹1k, ₹5.31 ≤ ₹25k, else ₹9.44. */
const payoutFee = (inr: number) => (inr <= 1_000 ? 2.36 : inr <= 25_000 ? 5.31 : 9.44);
const TDS = 0.01; // India: 1% tax deducted on selling digital dollars

/** Rupee breakdown for `dollars`. ponytail: rate from the app's FX table; Onramp's live quote replaces it when it answers. */
export function rupeesFor(dollars: number) {
  const rate = FX.INR;
  const gross = dollars * rate;
  const fee = payoutFee(gross);
  const tds = Math.round(gross * TDS * 100) / 100;
  return { rate, gross, fee, tds, inr: Math.max(0, gross - fee - tds) };
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Agora has approved Kin's cash-out contract to settle on its pair. */
export const agoraReady = () =>
  publicClient.readContract({ address: AGORA_PAIR, abi: pairAbi, functionName: "hasRole", args: ["APPROVED_SWAPPER", CASHOUT] }).catch(() => false);

/** Test-USDC units out for `units` dollars at Agora's fixed price. */
export async function quoteAgora(units: bigint): Promise<bigint> {
  const [, out] = await publicClient.readContract({ address: AGORA_PAIR, abi: pairAbi, functionName: "getAmountsOut", args: [units, [addr.ausd, SETTLE.address]] });
  return out;
}
export const usdcOf = (out: bigint) => Number(formatUnits(out, SETTLE.decimals));

export type OnrampQuote = { rupees: number; rate: number; fees: { onramp: number; gateway: number; tds: number }; sandbox: boolean };

/** Onramp's own quote for selling `usdc` for INR (server signs; keys stay there). */
export async function onrampQuote(usdc: number): Promise<OnrampQuote> {
  const res = await fetch(`${API_BASE}/api/onramp/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usdc: usdc.toFixed(6) }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`offramp: ${json.error ?? res.status}`);
  return json;
}

/** Payout reference stored on-chain: hash of a random salt + the UPI ID. Salted so the UPI ID (often a phone
 *  number) can't be brute-forced back from the event (audit). */
const payoutRef = (upi: string): Hex =>
  keccak256(toBytes(`upi:${toHex(crypto.getRandomValues(new Uint8Array(32)))}:${upi.trim().toLowerCase()}`));

type Terms = { to: Address; venue: number; minOut: bigint; payoutRef: Hex; salt: Hex };

/** Mirror of KinCashoutV2.termsNonce: the EIP-3009 nonce commits to every term, so the relay can't change any. */
const termsNonce = (t: Terms): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint8" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }],
      [BigInt(chain.id), CASHOUT, t.to, t.venue, t.minOut, t.payoutRef, t.salt],
    ),
  );

export type Hop = { from: string; to: string; amount: string };

function label(a: Address, me: Address): string {
  if (isAddressEqual(a, me)) return "You";
  if (isAddressEqual(a, CASHOUT)) return "Kin cash-out";
  if (isAddressEqual(a, AGORA_PAIR)) return "Agora settlement";
  return "Another account";
}

/**
 * Leg 1: one Identity check → dollars exchanged into the user's own account through Agora. `out` is the quote; up to
 * 0.5% slack. Returns the hash, every AUSD/USDC movement in the receipt, and the USDC that actually landed.
 */
export async function cashOut(me: Address, units: bigint, out: bigint) {
  const terms: Terms = { to: me, venue: AGORA_VENUE, minOut: (out * 995n) / 1000n, payoutRef: payoutRef("kin"), salt: toHex(crypto.getRandomValues(new Uint8Array(32))) };
  const hash = await cashOutSigned(CASHOUT, units, terms, termsNonce(terms));
  const { logs } = await publicClient.getTransactionReceipt({ hash });
  const moves = parseEventLogs({ abi: transferAbi, logs, eventName: "Transfer" }).filter(
    (l) => isAddressEqual(l.address, addr.ausd) || isAddressEqual(l.address, SETTLE.address),
  );
  const received = moves
    .filter((l) => isAddressEqual(l.address, SETTLE.address) && isAddressEqual(l.args.to, me))
    .reduce((sum, l) => sum + l.args.value, 0n);
  // Cash-out names the coins (user decision, Oct 11). Practice settles into Agora's test USDC (CTK).
  const hops: Hop[] = moves.map((l) => ({
    from: label(l.args.from, me),
    to: label(l.args.to, me),
    amount: isAddressEqual(l.address, addr.ausd) ? `${Number(formatUnits(l.args.value, 6)).toFixed(2)} AUSD` : `${usdcOf(l.args.value).toFixed(2)} USDC`,
  }));
  return { hash, hops, received };
}

// Rupees aren't on-chain, so this phone remembers them per cash-out for Activity and the receipt (web: localStorage).
// ponytail: SecureStore per payment, like categories; tracked so signOut clears it.
export type CashoutRecord = { rupees: number; practice: boolean };
const key = (hash: string) => `kin.cashout.${hash.toLowerCase()}`;

export function saveCashout(hash: string, r: CashoutRecord) {
  const k = key(hash);
  trackKey(k);
  return SecureStore.setItemAsync(k, JSON.stringify(r)).catch(() => {});
}

export function cashoutOf(hash: string): CashoutRecord | null {
  try {
    return JSON.parse(SecureStore.getItem(key(hash)) ?? "null") as CashoutRecord | null;
  } catch {
    return null;
  }
}
