import type { Address } from "viem";
import { addr, chain } from "./config";
import { HANDLE_RE } from "./names";

// Screens a Kin QR may open. Everything else is rejected ("That's not a Kin code").
const KIN_PATHS = ["/send", "/claim", "/invoice/new", "/chores"];

/** QR text → path on Kin (only our own links, or a bare @name), else null. */
export function kinTarget(text: string, origin: string): string | null {
  const t = text.trim();
  const bare = t.replace(/^@/, "").toLowerCase();
  if (HANDLE_RE.test(bare) && !t.includes("/")) return `/send?to=${bare}`;
  try {
    // ponytail: RN's URL never throws on junk; the origin/host check rejects it instead.
    const u = new URL(t);
    if (u.origin !== origin && u.hostname !== "kin-money.vercel.app") return null;
    if (!KIN_PATHS.includes(u.pathname)) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

// ---------- codes from other wallets (EIP-681). Mirrors app/src/lib/walletUri.ts — keep in sync. ----------

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const URI_RE = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/(\w+))?(?:\?(.*))?$/i;

/** EIP-681 amount: "5000000" or "5e6" / "2.5e6" → exact bigint, else null. */
function parseUint(v: string | null): bigint | null {
  const m = v?.match(/^(\d+)(?:\.(\d+))?(?:e(\d+))?$/i);
  if (!m) return null;
  const frac = m[2] ?? "";
  const shift = Number(m[3] ?? 0) - frac.length;
  return shift < 0 ? null : BigInt(m[1] + frac) * 10n ** BigInt(shift);
}

/** QR text → `{ to, units }` for a dollars-on-Monad payment, "other" for a different token/network/action, null if not a wallet code. */
export function parseWalletUri(text: string): { to: Address; units: bigint | null } | "other" | null {
  const t = text.trim();
  if (ADDR_RE.test(t)) return { to: t.toLowerCase() as Address, units: null };
  const m = t.match(URI_RE);
  if (!m) return null;
  const [, target, chainId, fn, query] = m;
  if (chainId && Number(chainId) !== chain.id) return "other";
  // ponytail: tiny query parse (values are hex/digits, nothing to decode); avoids RN URLSearchParams gaps.
  const q = new Map((query ?? "").split("&").filter(Boolean).map((kv) => kv.split("=") as [string, string]));
  if (!fn) return { to: target.toLowerCase() as Address, units: null }; // native `value` ignored — Kin pays in dollars
  if (fn !== "transfer" || target.toLowerCase() !== addr.ausd.toLowerCase()) return "other";
  const to = q.get("address") ?? "";
  if (!ADDR_RE.test(to)) return null;
  const units = q.has("uint256") ? parseUint(q.get("uint256") ?? null) : null;
  if (q.has("uint256") && units === null) return null;
  return { to: to.toLowerCase() as Address, units: units || null };
}
