import { createPublicClient, http, type Address } from "viem";
import { monadTestnet } from "viem/chains";

export const chain = {
  ...monadTestnet,
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
};

export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const env = (v: string | undefined) => (v || "0x0000000000000000000000000000000000000000") as Address;

// NEXT_PUBLIC_* must be referenced literally so Next inlines them.
export const addr = {
  ausd: env(process.env.NEXT_PUBLIC_AUSD),
  forwarder: env(process.env.NEXT_PUBLIC_FORWARDER),
  names: env(process.env.NEXT_PUBLIC_KIN_NAMES),
  escrow: env(process.env.NEXT_PUBLIC_KIN_ESCROW),
  stream: env(process.env.NEXT_PUBLIC_KIN_STREAM),
  pot: env(process.env.NEXT_PUBLIC_KIN_POT),
  circle: env(process.env.NEXT_PUBLIC_KIN_CIRCLE),
};

export const explorerTx = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;
