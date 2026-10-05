import { createPublicClient, fallback, http, type Address, type Chain, type PublicClient } from "viem";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { monad, monadTestnet } from "viem/chains";

// Same rpId as the PWA → same passkey → same account on web and phone.
export const RP_ID = "kin-money.vercel.app";
export const API_BASE = "https://kin-money.vercel.app";
// Realtime (public key, same as web NEXT_PUBLIC_PUSHER_*).
export const PUSHER = { key: "33b8e385c82424d3cc1e", cluster: "ap2" } as const;

export const chain = monadTestnet;
// Public testnet RPCs answer bursts with 429: batch parallel reads into one request, retry with backoff,
// then fall back to other public testnet endpoints (all checked: batch + CORS + chain 10143).
const rpc = (url?: string) => http(url, { batch: { wait: 16 }, retryCount: 4, retryDelay: 250 });
const BACKUP_RPCS = ["https://rpc.ankr.com/monad_testnet", "https://monad-testnet.drpc.org"];
// Alchemy node first when EXPO_PUBLIC_ALCHEMY_KEY is set at build time (EAS env); public RPCs stay as fallback.
const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_KEY;
const alchemy = (net: "testnet" | "mainnet") => (ALCHEMY_KEY ? [`https://monad-${net}.g.alchemy.com/v2/${ALCHEMY_KEY}`] : []);
export const publicClient = createPublicClient({ chain, transport: fallback([...alchemy("testnet"), "https://testnet-rpc.monad.xyz", ...BACKUP_RPCS].map(rpc)) });

// From contracts/deployments/10143.json.
export const addr = {
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  forwarder: "0xdF70AaC88E464c78cDe367B5d2879776C2994102",
  names: "0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476",
  escrow: "0x2F2e58b1B33B30756fa0653672B4ba10cF93a55e",
  stream: "0xaF989d7acE5a015875Fb5f28b22a091D441e41DB",
  pot: "0xd039f1D113ACd4E89d1f52Ca792D8F54F177a8bA",
  circle: "0x0b467a32E1A38b999134da4941caD136390c9B41",
  mandate: "0xe770eCfBf2D2D6b8B9c1B210B7a42B92bbA8fd53",
  giftlink: "0x7ad1C20D0B96BaE5aE72462137384A1924e36BDb",
} as const satisfies Record<string, Address>;
export const explorerTx = (hash: string) => `https://testnet.monadvision.com/tx/${hash}`;

// ---------- Practice / Real money (mirrors app/src/lib/chain.ts) ----------
// Real money (mainnet) covers balance, send, receive, activity, proof; programs + links stay on the practice network.
export const CASHOUT: Address = "0xDdBc1208e84E82676bfc7452F25cecDB3B05b75a"; // KinCashout, testnet (contracts/deployments/10143.json)
export type Mode = "test" | "main";
export type Network = { mode: Mode; chain: Chain; ausd: Address; client: PublicClient; explorer: string };
export const networks: Record<Mode, Network> = {
  test: { mode: "test", chain, ausd: addr.ausd, client: publicClient as PublicClient, explorer: "https://testnet.monadvision.com" },
  main: {
    mode: "main",
    chain: monad,
    ausd: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
    client: createPublicClient({ chain: monad, transport: fallback([...alchemy("mainnet"), "https://rpc.monad.xyz", "https://rpc1.monad.xyz"].map(rpc)) }) as PublicClient,
    explorer: "https://monadvision.com",
  },
};
const MODE_KEY = "kin.mode";
const modeListeners = new Set<() => void>();
let mode: Mode | null = null;
export function getMode(): Mode {
  if (mode) return mode;
  try {
    mode = SecureStore.getItem(MODE_KEY) === "main" ? "main" : "test";
  } catch {
    mode = "test";
  }
  return mode;
}
export function setMode(m: Mode) {
  mode = m;
  try {
    SecureStore.setItem(MODE_KEY, m);
  } catch {}
  modeListeners.forEach((l) => l());
}
const subscribeMode = (l: () => void) => (modeListeners.add(l), () => modeListeners.delete(l));
export const useMode = () => useSyncExternalStore(subscribeMode, getMode, getMode);
/** Network for money paths in the current mode. */
export const money = (): Network => networks[getMode()];
