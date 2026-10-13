// Fake data for /demo screens. Amounts in AUSD base units (6 decimals). Nothing here exists onchain.
import type { Address, Hex } from "viem";
import type { Item } from "@/lib/activity";
import type { GiftLink } from "@/lib/giftLinks";
import type { LinkInfo } from "@/lib/claimLink";
import type { Hop } from "@/lib/offramp";
import type { OnrampQuote } from "@/lib/onrampWidget";
import { networks } from "@/lib/chain";
import { CATEGORIES } from "@/lib/categories";
import type { Receipt } from "@/components/receipt/ReceiptTicket";

export const fakeHash = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}` as Hex;
const fakeAddr = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(20)}` as Address;

export const ME = fakeAddr(0xa1);
export const MAYA = fakeAddr(0xb2);
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const NOW = Date.now();
const nowSec = Math.floor(NOW / 1000);

const base = { explorer: networks.test.explorer, fromA: ME, toA: MAYA, at: new Date(NOW - 3 * 60_000), block: 70_475_686n, ok: true };
export const RECEIPT_SENT: Receipt = { ...base, amount: 25_000_000n, from: "@sam", to: "@maya", out: true };
export const RECEIPT_RECEIVED: Receipt = { ...base, amount: 120_500_000n, from: "@maya", to: "@sam", fromA: MAYA, toA: ME, out: false };
export const RECEIPT_FAILED: Receipt = { ...RECEIPT_SENT, ok: false };
export const CAT_FOOD = CATEGORIES[0];
export const CAT_FAMILY = CATEGORIES[4];

const min = 60_000;
const items: [string, Item["dir"], bigint, number, string][] = [
  ["@maya", "out", 25_000_000n, 3 * min, "3 min ago"],
  ["@ravi", "in", 120_500_000n, 42 * min, "42 min ago"],
  ["@lena", "out", 8_750_000n, 3 * 60 * min, "3 hours ago"],
  ["Welcome money", "in", 10_000_000n, 26 * 60 * min, "yesterday"],
  ["@maya", "in", 60_000_000n, 2 * 1440 * min, "2 days ago"],
  ["@tomas", "out", 15_250_000n, 4 * 1440 * min, "4 days ago"],
];
export const ITEMS: Item[] = items.map(([who, dir, amount, ago, when], i) => ({
  hash: fakeHash(0x10 + i), logIndex: 1, dir, other: fakeAddr(0x20 + i), amount, time: NOW - ago, who, when,
}));

const NEW_WHO = ["@noor", "@kai", "@ines", "@ola", "@dev"];
/** One more fake payment, for "Add new payment". */
export function newItem(n: number): Item {
  return { hash: fakeHash(0x40 + (n % 0xbf)), logIndex: n, dir: n % 2 ? "in" : "out", other: fakeAddr(0x40 + (n % 0xbf)), amount: BigInt(5 + n * 7) * 1_000_000n, time: Date.now(), who: NEW_WHO[n % NEW_WHO.length], when: "just now" };
}

// Cash-out run: $50 AUSD → 50 USDC → rupees (practice).
export const CASH_AUSD = 50;
const HOPS: Hop[] = [
  { from: "You", to: "Kin cash-out", amount: "50.00 AUSD" },
  { from: "Kin cash-out", to: "Agora settlement", amount: "50.00 AUSD" },
  { from: "Agora settlement", to: "You", amount: "49.98 USDC" },
];
const QUOTE: OnrampQuote = { rupees: 4_712.4, rate: 95.21, fees: { onramp: 23.8, gateway: 5.31, tds: 47.6 }, sandbox: true };
export const RUNS = [
  { phase: 1 },
  { phase: 2, hash: fakeHash(0x77), hops: HOPS, usdc: 49.98 },
  { phase: 3, hash: fakeHash(0x77), hops: HOPS, usdc: 49.98, rupees: QUOTE.rupees, quote: QUOTE },
] as const;

// Gift link: $40 from @maya, opens in 3 days (locked) or already open (unlockAt in the past).
const gift = (g: Partial<GiftLink & { sender: string }>): GiftLink & { sender: string } => ({
  id: 7n, from: MAYA, recipient: ZERO, amount: 40_000_000n, unlockAt: nowSec + 3 * 86_400, expiresAt: nowSec + 30 * 86_400, settled: false, sender: "maya", ...g,
});
export const GIFT = {
  unbound: gift({}),
  minelocked: gift({ recipient: ME }),
  mineReady: gift({ recipient: ME, unlockAt: nowSec - 60 }),
  mineOpened: gift({ recipient: ME, unlockAt: nowSec - 60, settled: true }),
  otherBound: gift({ recipient: fakeAddr(0xc3) }),
  gone: gift({ settled: true, recipient: fakeAddr(0xc3) }),
  fromMe: gift({ from: ME, sender: "sam" }),
};
export const GIFT_MESSAGE = "Happy birthday! Get yourself something nice";

export const CLAIM_INFO: LinkInfo & { sender: string } = { from: MAYA, amount: 30_000_000n, expiresAt: nowSec + 7 * 86_400, settled: false, sender: "maya" };
