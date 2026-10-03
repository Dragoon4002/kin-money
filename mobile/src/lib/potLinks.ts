// Port of app/src/lib/potLinks.ts — keep in sync.
import * as SecureStore from "expo-secure-store";
import { encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { KinPotAbi } from "./abi";
import { addr, API_BASE, chain, publicClient } from "./config";
import { same, ZERO } from "./programs";
import { call } from "./tx";

// Pot invite links: every member can have their own link. KinPot stores the address of a key that lives only in
// the link fragment (#id.inviter.key), never sent to a server. Anyone with the link signs "add me" with it and
// joins until the pot is full. The member keeps the key on this phone so the same link can be shared again;
// a new key (or none) makes their old link stop working. Other members' links are unaffected.
const slot = (id: bigint, me: Address) => `kin.potkey.${id}.${me.toLowerCase()}`;

export const linkUrl = (id: bigint, inviter: Address, key: Hex) => `${API_BASE}/pot/join#${id}.${inviter}.${key}`;

/** Fresh link key for `create` (pass `.address`); call `keepKey(id, me, key)` once the pot id is known. */
export const newKey = () => {
  const key = generatePrivateKey();
  return { key, address: privateKeyToAccount(key).address };
};

export function keepKey(id: bigint, me: Address, key: Hex) {
  try {
    SecureStore.setItem(slot(id, me), key);
  } catch {} // private mode: the member can make a new link later
}

/** `member`'s current link key address on pot `id` (ZERO = no link). */
export const inviteKeyOf = (id: bigint, member: Address) =>
  publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "inviteKeyOf", args: [id, member] });

/** My live link for pot `id` if this phone holds its key, else null. */
export function savedLink(id: bigint, me: Address, onchainKey: Address): string | null {
  let key: string | null = null;
  try {
    key = SecureStore.getItem(slot(id, me));
  } catch {}
  return key && onchainKey !== ZERO && same(privateKeyToAccount(key as Hex).address, onchainKey) ? linkUrl(id, me, key as Hex) : null;
}

/** Member only: my new link for pot `id` (my older link stops working). */
export async function createPotInvite(id: bigint, me: Address): Promise<string> {
  const { key, address } = newKey();
  await call(addr.pot, KinPotAbi, "setInviteKey", [id, address]);
  keepKey(id, me, key);
  return linkUrl(id, me, key);
}

/** Member only: turn my link off. */
export async function disablePotInvite(id: bigint, me: Address) {
  await call(addr.pot, KinPotAbi, "setInviteKey", [id, ZERO]);
  try {
    void SecureStore.deleteItemAsync(slot(id, me));
  } catch {}
}

/** "#12.0xInviter.0xKey" → { id, inviter, key } or null. */
export function parsePotLink(fragment: string): { id: bigint; inviter: Address; key: Hex } | null {
  const m = /^#?(\d+)\.(0x[0-9a-fA-F]{40})\.(0x[0-9a-fA-F]{64})$/.exec(fragment.trim());
  return m ? { id: BigInt(m[1]), inviter: m[2] as Address, key: m[3] as Hex } : null;
}

/** Add `me` to pot `id` via `inviter`'s link. Key signs keccak256(abi.encode(pot, chainId, id, inviter, me)) (EIP-191), per KinPot.join. */
export async function joinPot(id: bigint, inviter: Address, key: Hex, me: Address): Promise<Hex> {
  const digest = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address, address"), [addr.pot, BigInt(chain.id), id, inviter, me]),
  );
  const signature = await privateKeyToAccount(key).signMessage({ message: { raw: digest } });
  return call(addr.pot, KinPotAbi, "join", [id, inviter, me, signature]);
}
