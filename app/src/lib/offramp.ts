"use client";
import { formatUnits, isAddressEqual, parseAbi, parseEventLogs, toHex, type Address, type Hex, type Log, type TransactionReceipt } from "viem";
import { confirmPayment, getAccount } from "./account";
import { networks, type Mode } from "./chain";
import { payoutRef } from "./cashout";
import { ROUTES, termsNonce, venueId, type Venue } from "./cashoutRoutes";
import { ADD_MONEY, addMoneyNonce } from "./addMoneyTerms";

// Cash-out through KinCashoutV2 on either network: quote per venue, one Identity check, relay submits, then the
// receipt's transfers become the "where your money goes" hops. Exchanged money lands in the user's own account;
// payOut then sends it on to Onramp for rupees (not connected until Onramp keys arrive).

const pairAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function hasRole(string role, address account) view returns (bool)",
]);
// V4Quoter isn't view (it reverts internally) but eth_call works; declared view so viem reads it.
const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) view returns (uint256 amountOut, uint256 gasEstimate)",
]);
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const ZERO = "0x0000000000000000000000000000000000000000";

export type VenueStatus = { ok: boolean; why?: string };

/** Which venues can run on `net` right now (contract deployed, venue configured, Agora approval). */
export async function venueStatus(net: Mode): Promise<Record<Venue, VenueStatus>> {
  const r = ROUTES[net];
  const off = (why: string) => ({ ok: false, why });
  if (!r.cashout) return { agora: off("Cash-out contract not deployed on this network"), uniswap: off("Cash-out contract not deployed on this network") };
  const approved = r.agora
    ? await networks[net].client.readContract({ address: r.agora, abi: pairAbi, functionName: "hasRole", args: ["APPROVED_SWAPPER", r.cashout] }).catch(() => false)
    : false;
  return {
    agora: !r.agora ? off("No Agora pair on this network") : approved ? { ok: true } : off("Waiting for Agora to approve Kin"),
    uniswap: r.uniswap ? { ok: true } : off("No Uniswap pool on this network"),
  };
}

/** Settle-token units out for `units` dollars on `venue`. */
export async function quoteVia(net: Mode, venue: Venue, units: bigint): Promise<bigint> {
  const { client, ausd } = networks[net];
  const r = ROUTES[net];
  if (venue === "agora") {
    const [, out] = await client.readContract({ address: r.agora!, abi: pairAbi, functionName: "getAmountsOut", args: [units, [ausd, r.settle.address]] });
    return out;
  }
  const u = r.uniswap!;
  const zeroForOne = BigInt(ausd) < BigInt(r.settle.address);
  const [c0, c1] = zeroForOne ? [ausd, r.settle.address] : [r.settle.address, ausd];
  const [out] = await client.readContract({
    address: u.quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
    args: [{ poolKey: { currency0: c0, currency1: c1, fee: u.fee, tickSpacing: u.tickSpacing, hooks: ZERO }, zeroForOne, exactAmount: units, hookData: "0x" }],
  });
  return out;
}

export type Hop = { from: string; to: string; amount: string; proof?: string };

/** Readable name for an account seen in a cash-out. */
function label(net: Mode, a: Address, me: Address): string {
  const r = ROUTES[net];
  if (isAddressEqual(a, me)) return "You";
  if (r.cashout && isAddressEqual(a, r.cashout)) return "Kin cash-out";
  if (r.agora && isAddressEqual(a, r.agora)) return "Agora settlement";
  if (r.uniswap && isAddressEqual(a, r.uniswap.poolManager)) return "Uniswap pool";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Every dollar / settle-token movement in a cash-out receipt, in order. */
export function hopsFrom(net: Mode, logs: Log[], me: Address, hash: Hex): Hop[] {
  const { ausd, explorer } = networks[net];
  const s = ROUTES[net].settle;
  return parseEventLogs({ abi: transferAbi, logs, eventName: "Transfer" })
    .filter((l) => isAddressEqual(l.address, ausd) || isAddressEqual(l.address, s.address))
    .map((l) => ({
      from: label(net, l.args.from, me),
      to: label(net, l.args.to, me),
      // Cash-out names the coins (user decision, Oct 11). Practice settles into Agora's test USDC (CTK).
      amount: isAddressEqual(l.address, ausd) ? `${Number(formatUnits(l.args.value, 6)).toFixed(2)} AUSD` : `${Number(formatUnits(l.args.value, s.decimals)).toFixed(2)} USDC`,
      proof: `${explorer}/tx/${hash}`,
    }));
}

const now = () => BigInt(Math.floor(Date.now() / 1000));
const salt = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const AUTH = [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] as const;

/** Relay `body`, wait for the receipt. */
async function relay(net: Mode, body: object): Promise<TransactionReceipt> {
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, net }, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`relay: ${json.error ?? res.status}`);
  const receipt = await networks[net].client.waitForTransactionReceipt({ hash: json.hash });
  if (receipt.status !== "success") throw new Error("relay: reverted");
  return receipt;
}

/**
 * Leg 1: one Identity check → dollars exchanged into the user's own account. `out` is the quote; up to 0.5% slack.
 * Returns the hops and the settle-token amount that actually landed.
 */
export async function cashOutVia(net: Mode, venue: Venue, units: bigint, out: bigint, upi: string) {
  const r = ROUTES[net];
  const { ausd, chain } = networks[net];
  await confirmPayment(units);
  const account = await getAccount();
  const terms = { to: account.address, venue: venueId(venue), minOut: (out * 995n) / 1000n, payoutRef: payoutRef(upi || "kin"), salt: salt() };
  const auth = { from: account.address, to: r.cashout as Address, value: units, validAfter: 0n, validBefore: now() + 3600n, nonce: termsNonce(net, terms) };
  const signature = await account.signTypedData({
    domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: ausd },
    types: { ReceiveWithAuthorization: AUTH },
    primaryType: "ReceiveWithAuthorization",
    message: auth,
  });
  const receipt = await relay(net, { kind: "cashout", from: auth.from, terms, value: units, validAfter: auth.validAfter, validBefore: auth.validBefore, signature });
  const received = parseEventLogs({ abi: transferAbi, logs: receipt.logs, eventName: "Transfer" })
    .filter((l) => isAddressEqual(l.address, r.settle.address) && isAddressEqual(l.args.to, account.address))
    .reduce((sum, l) => sum + l.args.value, 0n);
  return { hash: receipt.transactionHash, hops: hopsFrom(net, receipt.logs, account.address, receipt.transactionHash), received };
}

/**
 * Leg 2 (real money): the exchanged USDC goes from the user's own account to the Onramp deposit address their sell
 * widget gave (lib/onrampWidget.ts) → rupees to the user's bank. No new Identity check: the session from leg 1 signs.
 */
export async function payOut(usdc: bigint, deposit: Address): Promise<{ hash: Hex; hop: Hop }> {
  const account = await getAccount();
  const s = ROUTES.main.settle;
  const auth = { from: account.address, to: deposit, value: usdc, validAfter: 0n, validBefore: now() + 3600n, nonce: salt() };
  const signature = await account.signTypedData({
    domain: { name: "USDC", version: "2", chainId: networks.main.chain.id, verifyingContract: s.address }, // Circle USDC on Monad (checked on-chain)
    types: { TransferWithAuthorization: AUTH },
    primaryType: "TransferWithAuthorization",
    message: auth,
  });
  const receipt = await relay("main", { kind: "usdc", auth, signature });
  const hash = receipt.transactionHash;
  return { hash, hop: { from: "You", to: "Onramp", amount: `${formatUnits(usdc, s.decimals)} ${s.symbol}`, proof: `${networks.main.explorer}/tx/${hash}` } };
}

/**
 * Add money (real money): USDC that arrived from another chain (Aurora Intents) → dollars in the user's own account
 * via KinAddMoney (Uniswap v4 AUSD/USDC pool). One Identity check; up to 0.5% slack on the quote.
 */
export async function convertToDollars(usdc: bigint): Promise<{ hash: Hex; ausdOut: bigint }> {
  if (!ADD_MONEY) throw new Error("not available");
  const { client, ausd, chain } = networks.main;
  const s = ROUTES.main.settle;
  const u = ROUTES.main.uniswap!;
  const zeroForOne = BigInt(s.address) < BigInt(ausd); // USDC in
  const [c0, c1] = zeroForOne ? [s.address, ausd] : [ausd, s.address];
  const [out] = await client.readContract({
    address: u.quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
    args: [{ poolKey: { currency0: c0, currency1: c1, fee: u.fee, tickSpacing: u.tickSpacing, hooks: ZERO }, zeroForOne, exactAmount: usdc, hookData: "0x" }],
  });
  await confirmPayment(usdc);
  const account = await getAccount();
  const terms = { to: account.address, minOut: (out * 995n) / 1000n, salt: salt() };
  const auth = { from: account.address, to: ADD_MONEY, value: usdc, validAfter: 0n, validBefore: now() + 3600n, nonce: addMoneyNonce(terms) };
  const signature = await account.signTypedData({
    domain: { name: "USDC", version: "2", chainId: chain.id, verifyingContract: s.address }, // Circle USDC on Monad (checked on-chain)
    types: { ReceiveWithAuthorization: AUTH },
    primaryType: "ReceiveWithAuthorization",
    message: auth,
  });
  const receipt = await relay("main", { kind: "addmoney", from: auth.from, terms, value: usdc, validAfter: auth.validAfter, validBefore: auth.validBefore, signature });
  const ausdOut = parseEventLogs({ abi: transferAbi, logs: receipt.logs, eventName: "Transfer" })
    .filter((l) => isAddressEqual(l.address, ausd) && isAddressEqual(l.args.to, account.address))
    .reduce((sum, l) => sum + l.args.value, 0n);
  return { hash: receipt.transactionHash, ausdOut };
}
