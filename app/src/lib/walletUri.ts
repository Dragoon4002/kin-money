// EIP-681 payment URIs so other wallets (MetaMask, Rabby…) can pay a Kin account.
// Dependency-free so scripts/check-scan.mts can run it under plain node.
// ponytail: testnet only (matches NEXT_PUBLIC_AUSD); switch both constants for mainnet.
export const AUSD = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
export const CHAIN_ID = 10143;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const URI_RE = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/(\w+))?(?:\?(.*))?$/i;

/** "Pay me" URI for other wallets: AUSD transfer on Monad, amount in 6-decimal base units (optional). */
export function walletUri(to: string, units?: bigint): string {
  const amt = units && units > 0n ? `&uint256=${units}` : "";
  return `ethereum:${AUSD}@${CHAIN_ID}/transfer?address=${to}${amt}`;
}

/** EIP-681 amount: "5000000" or "5e6" / "2.5e6" → exact bigint, else null. */
function parseUint(v: string | null): bigint | null {
  const m = v?.match(/^(\d+)(?:\.(\d+))?(?:e(\d+))?$/i);
  if (!m) return null;
  const frac = m[2] ?? "";
  const shift = Number(m[3] ?? 0) - frac.length;
  return shift < 0 ? null : BigInt(m[1] + frac) * 10n ** BigInt(shift);
}

/**
 * QR text → `{ to, units }` for an AUSD-on-Monad payment, "other" for a different token/network/action, null if not a wallet code.
 * Accepts `ethereum:<AUSD>@10143/transfer?address=…&uint256=…`, `ethereum:<addr>[@10143]`, and a bare 0x address.
 */
export function parseWalletUri(text: string): { to: string; units: bigint | null } | "other" | null {
  const t = text.trim();
  if (ADDR_RE.test(t)) return { to: t.toLowerCase(), units: null };
  const m = t.match(URI_RE);
  if (!m) return null;
  const [, target, chain, fn, query] = m;
  if (chain && Number(chain) !== CHAIN_ID) return "other";
  const q = new URLSearchParams(query ?? "");
  if (!fn) return { to: target.toLowerCase(), units: null }; // plain "pay this account"; native `value` ignored — Kin pays in dollars
  if (fn !== "transfer" || target.toLowerCase() !== AUSD.toLowerCase()) return "other";
  const to = q.get("address") ?? "";
  if (!ADDR_RE.test(to)) return null;
  const units = q.has("uint256") ? parseUint(q.get("uint256")) : null;
  if (q.has("uint256") && units === null) return null;
  return { to: to.toLowerCase(), units: units || null };
}

/** QR text → prefilled Kin pay path, "other" (wrong currency/network), or null. */
export function walletTarget(text: string): string | "other" | null {
  const w = parseWalletUri(text);
  if (!w || w === "other") return w;
  return `/send?to=${w.to}${w.units ? `&amt=${w.units}` : ""}`;
}
