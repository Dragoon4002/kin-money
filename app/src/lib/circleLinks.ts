"use client";
import { encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { KinCircleAbi } from "./abi";
import { addr, chain, publicClient } from "./chain";
import { same, ZERO } from "./programs";
import { call } from "./tx";

// Circle invite links: every member may hold one link. KinCircle stores the address of a key that lives only in
// the link fragment (#id.inviter.key), never sent to a server. Anyone with the link signs "seat me" with it and
// takes the next open seat (next turn). The member keeps the key on this phone so the link can be shared again.
const slot = (id: bigint, me: Address) => `kin.circlekey.${id}.${me.toLowerCase()}`;

const linkUrl = (id: bigint, inviter: Address, key: Hex) => `${location.origin}/circle/join#${id}.${inviter}.${key}`;

/** Current link key address of `member` in circle `id` (ZERO = link off). */
export const readInviteKey = (id: bigint, member: Address) =>
  publicClient.readContract({ address: addr.circle, abi: KinCircleAbi, functionName: "inviteKeyOf", args: [id, member] });

/** My live link for circle `id` if this phone holds its key, else null. */
export function savedCircleLink(id: bigint, me: Address, onchainKey: Address): string | null {
  let key: string | null = null;
  try {
    key = localStorage.getItem(slot(id, me));
  } catch {}
  return key && onchainKey !== ZERO && same(privateKeyToAccount(key as Hex).address, onchainKey) ? linkUrl(id, me, key as Hex) : null;
}

/** New link for my seat in circle `id` (my older link stops working). */
export async function createCircleInvite(id: bigint, me: Address): Promise<string> {
  const key = generatePrivateKey();
  await call(addr.circle, KinCircleAbi, "setInviteKey", [id, privateKeyToAccount(key).address]);
  try {
    localStorage.setItem(slot(id, me), key);
  } catch {} // private mode: make a new link later
  return linkUrl(id, me, key);
}

/** Turn my link off. */
export async function disableCircleInvite(id: bigint, me: Address) {
  await call(addr.circle, KinCircleAbi, "setInviteKey", [id, ZERO]);
  try {
    localStorage.removeItem(slot(id, me));
  } catch {}
}

/** "#12.0xinviter.0xkey" → { id, inviter, key } or null. */
export function parseCircleLink(fragment: string): { id: bigint; inviter: Address; key: Hex } | null {
  const m = /^#?(\d+)\.(0x[0-9a-fA-F]{40})\.(0x[0-9a-fA-F]{64})$/.exec(fragment.trim());
  return m ? { id: BigInt(m[1]), inviter: m[2] as Address, key: m[3] as Hex } : null;
}

/** Seat `me` in circle `id`. Key signs keccak256(abi.encode(circle, chainId, id, inviter, me)) (EIP-191), per KinCircle.claimSeat. */
export async function claimSeat(id: bigint, inviter: Address, key: Hex, me: Address): Promise<Hex> {
  const digest = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address, address"), [addr.circle, BigInt(chain.id), id, inviter, me]),
  );
  const signature = await privateKeyToAccount(key).signMessage({ message: { raw: digest } });
  return call(addr.circle, KinCircleAbi, "claimSeat", [id, inviter, me, signature]);
}
