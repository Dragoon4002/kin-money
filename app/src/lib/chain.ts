import { createPublicClient, fallback, http, type Address, type Chain, type PublicClient } from "viem";
import { monad, monadTestnet } from "viem/chains";

export const chain = {
  ...monadTestnet,
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
};

// Public testnet RPCs answer bursts with 429: batch parallel reads into one request, retry with backoff,
// then fall back to other public testnet endpoints (all checked: batch + CORS + chain 10143).
const rpc = (url?: string) => http(url, { batch: { wait: 16 }, retryCount: 4, retryDelay: 250 });
const BACKUP_RPCS = ["https://rpc.ankr.com/monad_testnet", "https://monad-testnet.drpc.org"];
// Alchemy node (Alchemy bounty): first in line when NEXT_PUBLIC_ALCHEMY_KEY is set, public RPCs stay as fallback.
// The key is public by design (browser reads); lock it to the Kin domain in the Alchemy dashboard.
const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_KEY;
// No retries on Alchemy: on a 429 fall through to the public RPCs at once (retries cost ~3.75s per call).
const alchemy = (net: "testnet" | "mainnet") =>
  ALCHEMY_KEY ? [http(`https://monad-${net}.g.alchemy.com/v2/${ALCHEMY_KEY}`, { batch: { wait: 16 }, retryCount: 0 })] : [];
export const publicClient = createPublicClient({
  chain,
  transport: fallback([...alchemy("testnet"), rpc(process.env.NEXT_PUBLIC_RPC_URL), ...BACKUP_RPCS.map(rpc)]),
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
  cashout: env(process.env.NEXT_PUBLIC_KIN_CASHOUT),
};

export const explorerTx = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;

// ---------- Practice / Real money ----------
// Everything above is the practice network (testnet): programs, names, links. Real money (mainnet) covers
// only balance, send, receive, activity and cash-out — those paths read `money()`, everything else is unchanged.
// ponytail: @names resolve from the testnet KinNames (same address on both networks); deploy KinNames on mainnet later.
export type Mode = "test" | "main";
const MAIN_RPCS = ["https://rpc.monad.xyz", "https://rpc1.monad.xyz"];
export type Network = { mode: Mode; chain: Chain; ausd: Address; client: PublicClient; explorer: string };
export const networks: Record<Mode, Network> = {
  test: { mode: "test", chain, ausd: addr.ausd, client: publicClient as PublicClient, explorer: chain.blockExplorers.default.url },
  main: {
    mode: "main",
    chain: monad,
    ausd: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as Address,
    client: createPublicClient({ chain: monad, transport: fallback([...alchemy("mainnet"), ...MAIN_RPCS.map(rpc)]) }) as PublicClient,
    explorer: "https://monadvision.com",
  },
};

const MODE_KEY = "kin.mode";
const modeListeners = new Set<() => void>();
export function getMode(): Mode {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MODE_KEY) === "main" ? "main" : "test";
  } catch {
    return "test";
  }
}
export function setMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
  modeListeners.forEach((l) => l());
}
export const subscribeMode = (l: () => void) => (modeListeners.add(l), () => modeListeners.delete(l));

/** Network for money paths in the current mode. */
export const money = (): Network => networks[getMode()];
