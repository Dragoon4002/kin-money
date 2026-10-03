import { createPublicClient, fallback, http, type Address } from "viem";
import { monadTestnet } from "viem/chains";

export const chain = {
  ...monadTestnet,
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
};

// Public testnet RPCs answer bursts with 429: batch parallel reads into one request, retry with backoff,
// then fall back to other public testnet endpoints (all checked: batch + CORS + chain 10143).
const rpc = (url?: string) => http(url, { batch: { wait: 16 }, retryCount: 4, retryDelay: 250 });
const BACKUP_RPCS = ["https://rpc.ankr.com/monad_testnet", "https://monad-testnet.drpc.org"];
export const publicClient = createPublicClient({
  chain,
  transport: fallback([rpc(process.env.NEXT_PUBLIC_RPC_URL), ...BACKUP_RPCS.map(rpc)]),
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
  mandate: env(process.env.NEXT_PUBLIC_KIN_MANDATE),
  giftlink: env(process.env.NEXT_PUBLIC_KIN_GIFTLINK),
};

export const explorerTx = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;
