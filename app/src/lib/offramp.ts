"use client";
import { formatUnits, isAddressEqual, parseAbi, parseEventLogs, toHex, type Address, type Hex, type Log } from "viem";
import { confirmPayment, getAccount } from "./account";
import { networks, type Mode } from "./chain";
import { payoutRef } from "./cashout";
import { ROUTES, termsNonce, venueId, type Venue } from "./cashoutRoutes";

// Cash-out through KinCashoutV2 on either network: quote per venue, one Identity check, relay submits, then the
// receipt's transfers become the "where your money goes" hops. The INR leg (Onramp) isn't connected yet.

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
      amount: isAddressEqual(l.address, ausd) ? `$${formatUnits(l.args.value, 6)} AUSD` : `${formatUnits(l.args.value, s.decimals)} ${s.symbol}`,
      proof: `${explorer}/tx/${hash}`,
    }));
}

const now = () => BigInt(Math.floor(Date.now() / 1000));

/** One Identity check → relay → receipt. `out` is the quote; up to 0.5% slack is allowed. */
export async function cashOutVia(net: Mode, venue: Venue, units: bigint, out: bigint, to: Address, upi: string) {
  const r = ROUTES[net];
  const { ausd, chain, client } = networks[net];
  await confirmPayment(units);
  const account = await getAccount();
  const terms = { to, venue: venueId(venue), minOut: (out * 995n) / 1000n, payoutRef: payoutRef(upi || "kin"), salt: toHex(crypto.getRandomValues(new Uint8Array(32))) };
  const auth = { from: account.address, to: r.cashout as Address, value: units, validAfter: 0n, validBefore: now() + 3600n, nonce: termsNonce(net, terms) };
  const signature = await account.signTypedData({
    domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: ausd },
    types: {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "ReceiveWithAuthorization",
    message: auth,
  });
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "cashout", net, from: auth.from, terms, value: units, validAfter: auth.validAfter, validBefore: auth.validBefore, signature }, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`relay: ${json.error ?? res.status}`);
  const receipt = await client.waitForTransactionReceipt({ hash: json.hash });
  if (receipt.status !== "success") throw new Error("relay: reverted");
  return { hash: json.hash as Hex, hops: hopsFrom(net, receipt.logs, account.address, json.hash) };
}
