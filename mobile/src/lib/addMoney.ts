import { encodeAbiParameters, isAddressEqual, keccak256, parseAbi, parseEventLogs, toHex, type Address, type Hex } from "viem";
import { confirmPayment, getAccount } from "./account";
import { API_BASE, networks } from "./config";

// Port of app/src/lib/{addMoney,addMoneyTerms}.ts + offramp.ts convertToDollars — keep in sync.
// "Add money from another account": Aurora Intents moves it to the user's own Kin address on Monad as USDC;
// KinAddMoney then turns it into dollars (AUSD). Real money only (mainnet).
export type Source = { id: string; label: string };

// Same ids as web; the server (/api/addmoney) holds the asset ids.
export const SOURCES: Source[] = [
  { id: "base-usdc", label: "USDC on Base" },
  { id: "arb-usdc", label: "USDC on Arbitrum" },
  { id: "eth-usdc", label: "USDC on Ethereum" },
  { id: "op-usdc", label: "USDC on Optimism" },
  { id: "pol-usdc", label: "USDC on Polygon" },
  { id: "bsc-usdc", label: "USDC on BNB Chain" },
  { id: "avax-usdc", label: "USDC on Avalanche" },
  { id: "sol-usdc", label: "USDC on Solana" },
  { id: "eth-usdt", label: "USDT on Ethereum" },
  { id: "tron-usdt", label: "USDT on Tron" },
  { id: "bsc-usdt", label: "USDT on BNB Chain" },
  { id: "arb-usdt", label: "USDT on Arbitrum" },
  { id: "op-usdt", label: "USDT on Optimism" },
  { id: "pol-usdt", label: "USDT on Polygon" },
  { id: "avax-usdt", label: "USDT on Avalanche" },
  { id: "sol-usdt", label: "USDT on Solana" },
  { id: "eth-eth", label: "ETH on Ethereum" },
  { id: "base-eth", label: "ETH on Base" },
  { id: "arb-eth", label: "ETH on Arbitrum" },
  { id: "op-eth", label: "ETH on Optimism" },
  { id: "sol-sol", label: "SOL on Solana" },
  { id: "btc-btc", label: "BTC on Bitcoin" },
];

/** Monad USDC, what lands in the user's Kin account. */
export const MONAD_USDC: Address = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const ADD_MONEY: Address = "0xdF70AaC88E464c78cDe367B5d2879776C2994102"; // KinAddMoney, contracts/deployments/143.json
const UNISWAP = { quoter: "0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891" as Address, fee: 50, tickSpacing: 1 };
const ZERO: Address = "0x0000000000000000000000000000000000000000";

export type AddStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";

export type AddQuote = {
  depositAddress: string;
  source: string; // SOURCES id
  recipient: string;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string; // Monad USDC, 6 decimals
  minAmountOut: string;
  timeEstimate: number; // seconds
  deadline: string; // ISO
};

export const coinOf = (s: Source) => s.label.split(" on ")[0];
export const chainOf = (s: Source) => s.label.split(" on ")[1];

const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) view returns (uint256 amountOut, uint256 gasEstimate)",
]);
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const AUTH = [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] as const;

type Terms = { to: Address; minOut: bigint; salt: Hex };
/** Mirrors KinAddMoney.termsNonce: keccak256(abi.encode(chainid, contract, to, minOut, salt)). */
const addMoneyNonce = (t: Terms): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [143n, ADD_MONEY, t.to, t.minOut, t.salt],
    ),
  );

/** Turn the arrived Monad USDC (6 dp units) into dollars via KinAddMoney. One Identity check; up to 0.5% slack. */
export async function convertToDollars(usdc: bigint): Promise<{ hash: Hex; ausdOut: bigint }> {
  const { client, ausd, chain } = networks.main;
  const zeroForOne = BigInt(MONAD_USDC) < BigInt(ausd); // USDC in
  const [c0, c1] = zeroForOne ? [MONAD_USDC, ausd] : [ausd, MONAD_USDC];
  const [out] = await client.readContract({
    address: UNISWAP.quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
    args: [{ poolKey: { currency0: c0, currency1: c1, fee: UNISWAP.fee, tickSpacing: UNISWAP.tickSpacing, hooks: ZERO }, zeroForOne, exactAmount: usdc, hookData: "0x" }],
  });
  await confirmPayment(usdc);
  const account = await getAccount();
  const terms = { to: account.address, minOut: (out * 995n) / 1000n, salt: toHex(crypto.getRandomValues(new Uint8Array(32))) };
  const auth = { from: account.address, to: ADD_MONEY, value: usdc, validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000)) + 3600n, nonce: addMoneyNonce(terms) };
  const signature = await account.signTypedData({
    domain: { name: "USDC", version: "2", chainId: chain.id, verifyingContract: MONAD_USDC }, // Circle USDC on Monad
    types: { ReceiveWithAuthorization: AUTH },
    primaryType: "ReceiveWithAuthorization",
    message: auth,
  });
  // ponytail: own relay call, lib/tx.ts relay() is private and returns only the hash; we need the receipt's logs.
  const body = { kind: "addmoney", net: "main", from: auth.from, terms, value: usdc, validAfter: auth.validAfter, validBefore: auth.validBefore, signature };
  const res = await fetch(`${API_BASE}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`relay: ${json.error ?? res.status}`);
  const receipt = await client.waitForTransactionReceipt({ hash: json.hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("relay: reverted");
  const ausdOut = parseEventLogs({ abi: transferAbi, logs: receipt.logs, eventName: "Transfer" })
    .filter((l) => isAddressEqual(l.address, ausd) && isAddressEqual(l.args.to, account.address))
    .reduce((sum, l) => sum + l.args.value, 0n);
  return { hash: receipt.transactionHash, ausdOut };
}
