import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, type Address } from "viem";

// Read-session token: `<address>.<exp>.<hmac>` (HMAC-SHA256, SESSION_SECRET). Lets the app read
// People/requests without Face ID. Not a key — it can't move money (writes still need a signature).

export const SESSION_DAYS = 180; // renewed silently on every unlock → effectively one Face ID per device
const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signToken(address: Address, exp: number, secret: string): string {
  const body = `${getAddress(address)}.${exp}`;
  return `${body}.${mac(body, secret)}`;
}

/** Address if `token` is well-formed, untampered and unexpired; else null. */
export function verifyToken(token: string, secret: string, now = Date.now() / 1000): Address | null {
  if (!secret) return null;
  const [a, expRaw, sig, extra] = token.split(".");
  if (extra !== undefined || !a || !sig || !isAddress(a, { strict: false }) || !/^\d{10}$/.test(expRaw ?? "")) return null;
  if (Number(expRaw) <= now) return null;
  const want = Buffer.from(mac(`${a}.${expRaw}`, secret));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want) ? getAddress(a) : null;
}
