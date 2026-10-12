import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { networks, type Mode } from "./chain";

// Cash-out routes per network (shared by the screen and /api/relay). KinCashoutV2 pulls the user's signed dollars,
// exchanges them on a venue and sends the output to a signed recipient. Empty `cashout` = not set up on that network.
const env = (v?: string) => (v || "") as Address | "";

export const VENUES = ["agora", "uniswap"] as const;
export type Venue = (typeof VENUES)[number];
export const venueId = (v: Venue) => VENUES.indexOf(v); // KinCashoutV2.Venue enum order

export type Route = {
  cashout: Address | "";
  settle: { address: Address; symbol: string; decimals: number };
  agora: Address | null; // Agora Instant Settlement pair
  uniswap: { poolManager: Address; quoter: Address; fee: number; tickSpacing: number } | null;
};

export const ROUTES: Record<Mode, Route> = {
  test: {
    cashout: env(process.env.NEXT_PUBLIC_KIN_CASHOUT_V2),
    settle: { address: "0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D", symbol: "CTK", decimals: 18 },
    agora: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
    uniswap: null,
  },
  main: {
    cashout: env(process.env.NEXT_PUBLIC_KIN_CASHOUT_V2_MAIN),
    settle: { address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", symbol: "USDC", decimals: 6 },
    agora: "0xf33286E3222D1c829dACeac48c0Ec651F6452470",
    uniswap: {
      poolManager: "0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e",
      quoter: "0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891",
      fee: 50,
      tickSpacing: 1,
    },
  },
};

export type Terms = { to: Address; venue: number; minOut: bigint; payoutRef: Hex; salt: Hex };

/** Mirror of KinCashoutV2.termsNonce: the EIP-3009 nonce commits to every term, so the relay can't change any. */
export const termsNonce = (net: Mode, t: Terms): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint8" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }],
      [BigInt(networks[net].chain.id), ROUTES[net].cashout as Address, t.to, t.venue, t.minOut, t.payoutRef, t.salt],
    ),
  );
