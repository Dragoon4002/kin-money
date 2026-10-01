import "server-only";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, publicClient } from "../chain";

// Relayer pays MON gas only; never holds user funds.
const relayer = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
const wallet = createWalletClient({ account: relayer, chain, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });

/** Max gas a single user request may consume (Monad bills the limit). Circle settle with 20 members fits. */
export const GAS_CAP = 1_500_000n;
const TIMEOUT_MS = 20_000;

// ponytail: in-process queue, dedupe and rate limits — per serverless instance only.
// Upgrade path: Upstash/Redis keys with TTL if abuse shows up or we scale out.
let queue: Promise<unknown> = Promise.resolve();
const seen = new Map<string, number>(); // dedupe key → expiry ms
const hits = new Map<string, number[]>(); // rate-limit key → timestamps

/** false if `key` was already submitted in the last hour (same signature / nonce). */
export function once(key: string): boolean {
  const t = Date.now();
  for (const [k, exp] of seen) if (exp < t) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, t + 3_600_000);
  return true;
}

/** Sliding-window limiter: at most `max` hits per `windowMs` for `key`. */
export function allow(key: string, max: number, windowMs = 60_000): boolean {
  const t = Date.now();
  const list = (hits.get(key) ?? []).filter((x) => x > t - windowMs);
  if (list.length >= max) return false;
  list.push(t);
  hits.set(key, list);
  return true;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

type Req = Parameters<typeof publicClient.simulateContract>[0];

/** Simulate → send with gas = min(estimate × 1.2, cap). Serialized for nonce safety, with timeout. */
export function submit(req: Omit<Req, "account">, cap = GAS_CAP): Promise<Hex> {
  const run = async () => {
    const { request } = await publicClient.simulateContract({ ...req, account: relayer } as Req);
    const est = await publicClient.estimateContractGas({ ...req, account: relayer } as never);
    const gas = (est * 12n) / 10n;
    if (gas > cap) throw new Error("gas over cap");
    return wallet.writeContract({ ...request, gas } as never);
  };
  const timed = () =>
    Promise.race([run(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("relay timeout")), TIMEOUT_MS))]);
  const next = queue.then(timed, timed);
  queue = next.catch(() => {});
  return next;
}
