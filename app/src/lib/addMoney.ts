// "Add money from another account": where the money can come from. Aurora Intents (NEAR Intents) moves it to the
// user's own Kin address on Monad as USDC; KinAddMoney then turns it into dollars (AUSD). Asset ids: 1Click /v0/tokens.
export type Source = { id: string; label: string; asset: string; decimals: number; evm: boolean };

export const SOURCES: Source[] = [
  { id: "base-usdc", label: "USDC on Base", asset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", decimals: 6, evm: true },
  { id: "arb-usdc", label: "USDC on Arbitrum", asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", decimals: 6, evm: true },
  { id: "eth-usdc", label: "USDC on Ethereum", asset: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", decimals: 6, evm: true },
  { id: "op-usdc", label: "USDC on Optimism", asset: "nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ", decimals: 6, evm: true },
  { id: "pol-usdc", label: "USDC on Polygon", asset: "nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L", decimals: 6, evm: true },
  { id: "eth-usdt", label: "USDT on Ethereum", asset: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", decimals: 6, evm: true },
  { id: "base-eth", label: "ETH on Base", asset: "nep141:base.omft.near", decimals: 18, evm: true },
  { id: "arb-eth", label: "ETH on Arbitrum", asset: "nep141:arb.omft.near", decimals: 18, evm: true },
  { id: "sol-usdc", label: "USDC on Solana", asset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", decimals: 6, evm: false },
];

/** Monad USDC, the asset that lands in the user's Kin account. */
export const MONAD_USDC_ASSET = "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx";
export const MONAD_USDC = "0x754704bc059f8c67012fed69bc8a327a5aafb603" as const;

export type AddStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";

export type AddQuote = {
  depositAddress: string;
  amountIn: string; // source smallest units
  amountInFormatted: string;
  amountOut: string; // Monad USDC, 6 decimals
  minAmountOut: string;
  timeEstimate: number; // seconds
  deadline: string; // ISO
};

/** Turn the arrived Monad USDC (6 dp units) into dollars (AUSD) via KinAddMoney. */
