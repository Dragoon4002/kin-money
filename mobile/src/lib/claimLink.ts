// Port of app/src/lib/claimLink.ts — keep in sync.
import * as SecureStore from "expo-secure-store";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { KinEscrowAbi } from "./abi";
import { addr, API_BASE, chain, publicClient } from "./config";
import { call } from "./tx";

// Claim links: money held in KinEscrow, releasable by whoever holds the one-time key in the URL fragment
// (fragment never reaches a server). Sender can take it back after 7 days.
const WEEK = 7 * 24 * 3600;

export type LinkInfo = { from: Address; amount: bigint; expiresAt: number; settled: boolean };

/** Lock `value` and return a shareable link. Resolves once the money is held. */
export async function createLink(me: Address, value: bigint): Promise<{ url: string; hash: Hex }> {
  const key = generatePrivateKey();
  const claimKey = privateKeyToAccount(key).address;
  const expiresAt = Math.floor(Date.now() / 1000) + WEEK;
  const hash = await call(addr.escrow, KinEscrowAbi, "create", [zeroAddress, claimKey, zeroAddress, 0, expiresAt, 0], { fund: value });
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const [ev] = parseEventLogs({ abi: KinEscrowAbi, eventName: "Created", logs: receipt.logs });
  const id = ev.args.id;
  rememberLink(me, id);
  return { url: `${API_BASE}/claim#${id}.${key}`, hash };
}

/** "#12.0xabc…" → { id, key } or null. */
export function parseLink(fragment: string): { id: bigint; key: Hex } | null {
  const m = /^#?(\d+)\.(0x[0-9a-fA-F]{64})$/.exec(fragment.trim());
  return m ? { id: BigInt(m[1]), key: m[2] as Hex } : null;
}

export async function readLink(id: bigint): Promise<LinkInfo> {
  const [from, , expiresAt, , settled, , , , amount] = await publicClient.readContract({
    address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [id],
  });
  return { from, amount, expiresAt, settled };
}

/** Collect to `recipient`. The link key signs keccak256(abi.encode(escrow, chainId, id, recipient)) (EIP-191), per KinEscrow.claim. */
export async function collectLink(id: bigint, key: Hex, recipient: Address): Promise<Hex> {
  const digest = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [addr.escrow, BigInt(chain.id), id, recipient]),
  );
  const signature = await privateKeyToAccount(key).signMessage({ message: { raw: digest } });
  return call(addr.escrow, KinEscrowAbi, "claim", [id, recipient, signature]);
}

export function refundLink(id: bigint): Promise<Hex> {
  return call(addr.escrow, KinEscrowAbi, "refund", [id]);
}

// Only link ids are remembered (never the key) so the sender can take back uncollected money.
const store = (me: Address) => `kin.links.${me.toLowerCase()}`;

function rememberLink(me: Address, id: bigint) {
  SecureStore.setItem(store(me), JSON.stringify([id.toString(), ...myLinkIds(me).map(String)]));
}

export function forgetLink(me: Address, id: bigint) {
  SecureStore.setItem(store(me), JSON.stringify(myLinkIds(me).filter((x) => x !== id).map(String)));
}

export function myLinkIds(me: Address): bigint[] {
  return (JSON.parse(SecureStore.getItem(store(me)) ?? "[]") as string[]).map(BigInt);
}
