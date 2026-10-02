import { API_BASE, addr, chain } from "./config";
import { FX, getCurrency, toDollars } from "./money";

/**
 * "Pay me" link — also what My QR and request links encode.
 * Amount travels in dollar base units (`amt`, 6 decimals) so a link made in ₹ reads right on a $ phone.
 */
export function payLink(handle: string, units?: bigint, note?: string): string {
  const q = new URLSearchParams({ to: handle });
  if (units && units > 0n) q.set("amt", units.toString());
  if (note) q.set("note", note.slice(0, 80));
  return `${API_BASE}/send?${q}`;
}

/** Valid `amt` param → base units, else null. */
export function parseAmt(v: string | null | undefined): bigint | null {
  if (!v || !/^\d{1,15}$/.test(v)) return null;
  const n = BigInt(v);
  return n > 0n ? n : null;
}

/** Base units → editable local amount string ("442.50"). */
export function unitsToLocal(units: bigint, currency = getCurrency()): string {
  return (toDollars(units) * (FX[currency] ?? 1)).toFixed(2);
}

/** "Pay me" code for other wallets (EIP-681): dollars (AUSD) transfer on Monad, amount in base units (optional). */
export function walletUri(to: string, units?: bigint): string {
  const amt = units && units > 0n ? `&uint256=${units}` : "";
  return `ethereum:${addr.ausd}@${chain.id}/transfer?address=${to}${amt}`;
}
