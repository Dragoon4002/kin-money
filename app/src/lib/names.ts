import type { Address } from "viem";
import { KinNamesAbi } from "./abi";
import { addr, publicClient } from "./chain";

const ZERO = "0x0000000000000000000000000000000000000000";

/** "@Alice" → address, or null if unclaimed. */
export async function resolveName(handle: string): Promise<Address | null> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!h) return null;
  const a = await publicClient.readContract({ address: addr.names, abi: KinNamesAbi, functionName: "resolve", args: [h] });
  return a === ZERO ? null : a;
}

/** address → "alice" or "" if none. */
export function nameOf(address: Address): Promise<string> {
  return publicClient.readContract({ address: addr.names, abi: KinNamesAbi, functionName: "nameOf", args: [address] });
}

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** "0x1a2b…9f0e" — shown only for accounts not on Kin (no @name). */
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
