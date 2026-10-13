import { formatUnits } from "viem";
// "Add money from another account": where the money can come from. Aurora Intents (NEAR Intents) moves it to the
// user's own Kin address on Monad as USDC; KinAddMoney then turns it into dollars (AUSD). Asset ids: 1Click /v0/tokens.
export type Source = { id: string; label: string; asset: string; decimals: number };

// ponytail: chains whose deposits need a memo (TON, XRP, Stellar) are left out; the screen doesn't show one.

export const SOURCES: Source[] = [
  { id: "base-usdc", label: "USDC on Base", asset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", decimals: 6 },
  { id: "arb-usdc", label: "USDC on Arbitrum", asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", decimals: 6 },
  { id: "eth-usdc", label: "USDC on Ethereum", asset: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", decimals: 6 },
  { id: "op-usdc", label: "USDC on Optimism", asset: "nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ", decimals: 6 },
  { id: "pol-usdc", label: "USDC on Polygon", asset: "nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L", decimals: 6 },
  { id: "bsc-usdc", label: "USDC on BNB Chain", asset: "nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r", decimals: 18 },
  { id: "avax-usdc", label: "USDC on Avalanche", asset: "nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o", decimals: 6 },
  { id: "sol-usdc", label: "USDC on Solana", asset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", decimals: 6 },
  { id: "eth-usdt", label: "USDT on Ethereum", asset: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", decimals: 6 },
  { id: "tron-usdt", label: "USDT on Tron", asset: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near", decimals: 6 },
  { id: "bsc-usdt", label: "USDT on BNB Chain", asset: "nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g", decimals: 18 },
  { id: "arb-usdt", label: "USDT on Arbitrum", asset: "nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near", decimals: 6 },
  { id: "op-usdt", label: "USDT on Optimism", asset: "nep245:v2_1.omni.hot.tg:10_359RPSJVdTxwTJT9TyGssr2rFoWo", decimals: 6 },
  { id: "pol-usdt", label: "USDT on Polygon", asset: "nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr", decimals: 6 },
  { id: "avax-usdt", label: "USDT on Avalanche", asset: "nep245:v2_1.omni.hot.tg:43114_372BeH7ENZieCaabwkbWkBiTTgXp", decimals: 6 },
  { id: "sol-usdt", label: "USDT on Solana", asset: "nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near", decimals: 6 },
  { id: "eth-eth", label: "ETH on Ethereum", asset: "nep141:eth.omft.near", decimals: 18 },
  { id: "base-eth", label: "ETH on Base", asset: "nep141:base.omft.near", decimals: 18 },
  { id: "arb-eth", label: "ETH on Arbitrum", asset: "nep141:arb.omft.near", decimals: 18 },
  { id: "op-eth", label: "ETH on Optimism", asset: "nep245:v2_1.omni.hot.tg:10_11111111111111111111", decimals: 18 },
  { id: "sol-sol", label: "SOL on Solana", asset: "nep141:sol.omft.near", decimals: 9 },
  { id: "btc-btc", label: "BTC on Bitcoin", asset: "nep141:btc.omft.near", decimals: 8 },
];

/** Monad USDC, the asset that lands in the user's Kin account. */
export const MONAD_USDC_ASSET = "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx";
export const MONAD_USDC = "0x754704bc059f8c67012fed69bc8a327a5aafb603" as const;

export type AddStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";

export type AddQuote = {
  depositAddress: string;
  source: string; // SOURCES id
  recipient: string; // Kin address the dollars go to
  amountIn: string; // source smallest units
  amountInFormatted: string; // what the payer sends, rounded up (payAmount)
  amountOut: string; // Monad USDC, 6 decimals
  minAmountOut: string;
  timeEstimate: number; // seconds
  deadline: string; // ISO
};

export const coinOf = (s: Source) => s.label.split(" on ")[0];
export const chainOf = (s: Source) => s.label.split(" on ")[1];

/** What the payer sends: rounded UP to at most 6 decimals so it reads cleanly (0.040346351114079339 → 0.040347 ETH).
 *  A hair over the quote is fine: it's inside the 1% slippage, never under the minimum. */
export function payAmount(amountIn: string, decimals: number): string {
  const step = 10n ** BigInt(Math.max(0, decimals - 6));
  return formatUnits(((BigInt(amountIn) + step - 1n) / step) * step, decimals);
}

/** Turn the arrived Monad USDC (6 dp units) into dollars (AUSD) via KinAddMoney. */
