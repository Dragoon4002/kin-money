"use client";
import { encodeAbiParameters, keccak256, parseAbiParameters, parseEventLogs, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { KinGiftLinkAbi } from "./abi";
import { addr, chain, publicClient } from "./chain";
import { same, ZERO } from "./programs";
import { call } from "./tx";

// Gift links: dated money held in KinGiftLink behind a one-time key in the URL fragment (never sent to a server).
// The first person to open the link binds it to their account; it opens on the date. Sender can take it
// back 60 days after the opening date if it was never opened.
const HOLD = 60 * 86_400;

export type GiftLink = { id: bigint; from: Address; recipient: Address; amount: bigint; unlockAt: number; expiresAt: number; settled: boolean };

/** Lock `value` until `unlockAt` and return the shareable link. Resolves once the money is held. */
export async function createGiftLink(value: bigint, unlockAt: number, message = ""): Promise<{ url: string; id: bigint; hash: Hex }> {
  const key = generatePrivateKey();
  const claimKey = privateKeyToAccount(key).address;
  const hash = await call(addr.giftlink, KinGiftLinkAbi, "create", [claimKey, unlockAt, unlockAt + HOLD], { fund: value });
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const [ev] = parseEventLogs({ abi: KinGiftLinkAbi, eventName: "Created", logs: receipt.logs });
  const m = message.trim() ? `&m=${encodeURIComponent(message.trim())}` : "";
  return { url: `${location.origin}/gift/open#${ev.args.id}.${key}${m}`, id: ev.args.id, hash };
}

/** "#12.0xabc…&m=Happy%20birthday" → { id, key, message } or null. */
export function parseGiftLink(fragment: string): { id: bigint; key: Hex; message: string } | null {
  const m = /^#?(\d+)\.(0x[0-9a-fA-F]{64})(?:&m=(.*))?$/.exec(fragment.trim());
  if (!m) return null;
  let message = "";
  try {
    message = m[3] ? decodeURIComponent(m[3]).slice(0, 200) : "";
  } catch {} // malformed message: still a valid gift
  return { id: BigInt(m[1]), key: m[2] as Hex, message };
}

type Row = readonly [Address, number, number, boolean, Address, bigint, Address];
const toGift = (id: bigint, [from, unlockAt, expiresAt, settled, recipient, amount]: Row): GiftLink => ({ id, from, recipient, amount, unlockAt, expiresAt, settled });

export async function readGiftLink(id: bigint): Promise<GiftLink> {
  return toGift(id, await publicClient.readContract({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "gifts", args: [id] }));
}

/** Assign gift `id` to `me`. The link key signs keccak256(abi.encode(giftlink, chainId, id, me)) (EIP-191), per KinGiftLink.bind. */
export async function bindGift(id: bigint, key: Hex, me: Address): Promise<Hex> {
  const digest = keccak256(encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [addr.giftlink, BigInt(chain.id), id, me]));
  const signature = await privateKeyToAccount(key).signMessage({ message: { raw: digest } });
  return call(addr.giftlink, KinGiftLinkAbi, "bind", [id, me, signature]);
}

export const openGift = (id: bigint) => call(addr.giftlink, KinGiftLinkAbi, "open", [id]);
export const refundGift = (id: bigint) => call(addr.giftlink, KinGiftLinkAbi, "refund", [id]);

// ponytail: scans the newest 400 gift links; add an indexer when usage outgrows it.
const MAX_IDS = 400n;

/** Gift links I sent or that are bound to me, newest first. */
export async function listGiftLinks(me: Address): Promise<GiftLink[]> {
  const count = await publicClient.readContract({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "count" });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < MAX_IDS; i--) ids.push(i);
  const rows = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "gifts", args: [id] }) as const),
    allowFailure: false,
  });
  return ids.map((id, i) => toGift(id, rows[i])).filter((g) => same(g.from, me) || same(g.recipient, me));
}

export const isBound = (g: GiftLink) => g.recipient !== ZERO;
