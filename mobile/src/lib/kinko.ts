import * as SecureStore from "expo-secure-store";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { DEFAULT_LOOK, type Look } from "@/components/Kinko";
import { KinCircleAbi, KinEscrowAbi, KinPotAbi, KinStreamAbi } from "./abi";
import { addr, publicClient } from "./config";
import { isUnlocked as sessionOpen } from "./account";
import { listInvites, publishLook } from "./contacts";

// Kinko closet + Kin Score — port of app/src/lib/kinko.ts. Unlocks come from real onchain history,
// plus invites (SecureStore `kin.ref` / `kin.invited`). Own look in SecureStore `kin.kinko.<address>`.

export type Ach = "joined" | "gave" | "allowance" | "jar" | "circle" | "chore" | "invite";
const POINTS: Record<Ach, number> = { joined: 10, gave: 15, allowance: 15, jar: 20, circle: 20, chore: 10, invite: 10 };

export const LEVELS = [[0, "Sprout"], [25, "Buddy"], [50, "Pal"], [75, "Champion"]] as const;
export type Level = (typeof LEVELS)[number][1];

export type ItemKind = "skin" | "expression" | "accessory";
/** `need`: an achievement, or a minimum Kin Score. `slot`: one accessory per slot. */
export type Item = { id: string; label: string; kind: ItemKind; need?: Ach | number; hint: string; slot?: "head" | "face" | "neck" | "side" };

export const ITEMS: Item[] = [
  { id: "classic", label: "Classic", kind: "skin", hint: "" },
  { id: "mint", label: "Pistachio", kind: "skin", need: 25, hint: "Reach Buddy level" },
  { id: "sunset", label: "Sunset", kind: "skin", need: 50, hint: "Reach Pal level" },
  { id: "night", label: "Night", kind: "skin", need: "circle", hint: "Join a circle and pay your turn" },
  { id: "gold", label: "Gold", kind: "skin", need: 75, hint: "Reach Champion level" },
  { id: "smile", label: "Smile", kind: "expression", hint: "" },
  { id: "grin", label: "Grin", kind: "expression", hint: "" },
  { id: "sleepy", label: "Sleepy", kind: "expression", hint: "" },
  { id: "wink", label: "Wink", kind: "expression", need: 25, hint: "Reach Buddy level" },
  { id: "cool", label: "Cool", kind: "expression", need: 50, hint: "Reach Pal level" },
  { id: "party", label: "Party hat", kind: "accessory", slot: "head", need: "invite", hint: "Invite a friend to Kin" },
  { id: "scarf", label: "Scarf", kind: "accessory", slot: "neck", need: "gave", hint: "Give an allowance or gift" },
  { id: "headphones", label: "Headphones", kind: "accessory", slot: "head", need: "allowance", hint: "Collect your allowance" },
  { id: "crown", label: "Crown", kind: "accessory", slot: "head", need: "jar", hint: "Fill a savings jar" },
  { id: "cap", label: "Cap", kind: "accessory", slot: "head", need: "circle", hint: "Pay your circle on time" },
  { id: "bow", label: "Bow", kind: "accessory", slot: "side", need: "chore", hint: "Get paid for a chore" },
  { id: "shades", label: "Shades", kind: "accessory", slot: "face", need: 50, hint: "Reach Pal level" },
  { id: "chain", label: "Necklace", kind: "accessory", slot: "neck", need: 75, hint: "Reach Champion level" },
];

// ---------- achievements (onchain) ----------
// Same rules as web lib/kinko.ts load(); only the booleans are read, so no full program readers.

// ponytail: scans newest MAX_IDS records per contract (same ceiling as web programs.ts).
const MAX_IDS = 400n;
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const ZERO = "0x0000000000000000000000000000000000000000";
const CHORE_MARK = 1;

type Abi = typeof KinStreamAbi | typeof KinEscrowAbi | typeof KinPotAbi | typeof KinCircleAbi;

/** Rows newest-first for ids 1..count(), read in one multicall. `arg` (if given) is appended to the id. */
async function scan<R>(address: Address, abi: Abi, fn: string, arg?: Address): Promise<R[]> {
  const count = (await publicClient.readContract({ address, abi: abi as typeof KinPotAbi, functionName: "count" })) as bigint;
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < MAX_IDS; i--) ids.push(i);
  return (await publicClient.multicall({
    contracts: ids.map((id) => ({ address, abi, functionName: fn, args: arg ? [id, arg] : [id] }) as never),
    allowFailure: false,
  })) as R[];
}

type StreamRow = readonly [Address, number, number, Address, bigint, bigint]; // payer,start,end,payee,amount,withdrawn
type PotRow = readonly [bigint, bigint, bigint, boolean, boolean]; // target,balance,round,closed,toAll
type MemberRow = readonly [boolean, boolean, boolean, unknown, number]; // member,joined,defaulted,_,paidRound
type EscrowRow = readonly [Address, number, number, boolean, boolean, Address, number, Address, bigint]; // from,unlockAt,expiresAt,approved,settled,to,autoApproveAt,approver,amount

const stored = (k: string) => {
  try {
    return SecureStore.getItem(k);
  } catch {
    return null;
  }
};

async function load(me: Address): Promise<Set<Ach>> {
  const got = new Set<Ach>(["joined"]);
  if (stored("kin.ref") || Number(stored("kin.invited") ?? 0) > 0) got.add("invite");
  // Server knows invites made from other phones. Only ask when already unlocked — never prompt biometrics for this.
  const invites = !got.has("invite") && sessionOpen() ? listInvites().catch(() => null) : null;
  const [streams, pots, circles, escrows] = await Promise.allSettled([
    scan<StreamRow>(addr.stream, KinStreamAbi, "streams"),
    scan<PotRow>(addr.pot, KinPotAbi, "pots"),
    scan<MemberRow>(addr.circle, KinCircleAbi, "memberInfo", me),
    scan<EscrowRow>(addr.escrow, KinEscrowAbi, "escrows"),
  ]);
  const inv = await invites;
  if (inv && (inv.invited.length > 0 || inv.invitedBy)) got.add("invite");
  if (streams.status === "fulfilled") {
    if (streams.value.some((s) => same(s[3], me) && !same(s[0], me) && s[5] > 0n)) got.add("allowance");
    if (streams.value.some((s) => same(s[0], me) && !same(s[3], me))) got.add("gave");
  }
  if (pots.status === "fulfilled") {
    // Paid-out pots (round > 0): did any pay me? Recipients come from beneficiariesOf (handles "everyone").
    const count = (await publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "count" })) as bigint; // scan() is newest first: row i = pot id (count - i)
    const paid = pots.value.map((p, i) => [count - BigInt(i), p[2]] as const).filter(([, round]) => round > 0n);
    const lists = paid.length
      ? ((await publicClient.multicall({ contracts: paid.map(([id]) => ({ address: addr.pot, abi: KinPotAbi, functionName: "beneficiariesOf", args: [id] }) as const), allowFailure: true }))
          .map((x) => (x.status === "success" ? (x.result as readonly Address[]) : [])))
      : [];
    if (lists.some((l) => l.some((b) => same(b, me)))) got.add("jar");
  }
  if (circles.status === "fulfilled" && circles.value.some((m) => m[0] && m[4] > 0 && !m[2])) got.add("circle");
  if (escrows.status === "fulfilled") {
    for (const [from, unlockAt, , approved, settled, to, autoApproveAt] of escrows.value) {
      const link = to === ZERO;
      const chore = !link && !autoApproveAt && unlockAt === CHORE_MARK;
      const gift = !link && !autoApproveAt && unlockAt > CHORE_MARK;
      if (chore && settled && approved && same(to, me) && !same(from, me)) got.add("chore");
      if ((gift || link) && same(from, me) && !same(to, me)) got.add("gave");
    }
  }
  return got;
}

// ponytail: 60s in-memory cache per address, same as web.
const cache = new Map<string, { at: number; p: Promise<Set<Ach>> }>();
function achievements(me: Address) {
  const key = me.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = load(me);
  cache.set(key, { at: Date.now(), p });
  return p;
}

export function scoreOf(got: Set<Ach>) {
  const score = [...got].reduce((s, a) => s + POINTS[a], 0);
  const i = LEVELS.findLastIndex(([min]) => score >= min);
  const next = LEVELS[i + 1]?.[0];
  const progress = next === undefined ? 1 : (score - LEVELS[i][0]) / (next - LEVELS[i][0]);
  return { score, level: LEVELS[i][1] as Level, progress };
}

export function isUnlocked(item: Item, got: Set<Ach>, score: number) {
  return item.need === undefined || (typeof item.need === "number" ? score >= item.need : got.has(item.need));
}

// ---------- own look (SecureStore, sync store) ----------

const listeners = new Set<() => void>();
const looks = new Map<string, Look>();
const keyOf = (a: Address) => `kin.kinko.${a.toLowerCase()}`;

/** Look saved on this phone for `a`, or undefined if never customised. */
export function savedLook(a?: Address): Look | undefined {
  if (!a) return undefined;
  const key = keyOf(a);
  if (!looks.has(key)) {
    const raw = stored(key);
    if (!raw) return undefined;
    try {
      looks.set(key, { ...DEFAULT_LOOK, ...(JSON.parse(raw) as Partial<Look>) });
    } catch {
      return undefined;
    }
  }
  return looks.get(key);
}

export const subscribeLooks = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function saveLook(a: Address, look: Look) {
  looks.set(keyOf(a), look);
  try {
    SecureStore.setItem(keyOf(a), JSON.stringify(look));
  } catch {}
  listeners.forEach((l) => l());
  void publishLook(look); // others see my character
}

/** Kinko look, Kin Score/level and unlocked item ids for `address`. Never blocks render. */
export function useKinko(address?: Address) {
  const look = useSyncExternalStore(subscribeLooks, () => savedLook(address)) ?? DEFAULT_LOOK;
  const [got, setGot] = useState<{ for?: Address; set: Set<Ach> }>({ set: new Set(["joined"]) });

  useEffect(() => {
    if (!address) return;
    let live = true;
    achievements(address).then((set) => live && setGot({ for: address, set }));
    return () => {
      live = false;
    };
  }, [address]);

  const set = got.for === address ? got.set : new Set<Ach>(address ? ["joined"] : []);
  const { score, level, progress } = scoreOf(set);
  const unlocked = new Set(ITEMS.filter((i) => isUnlocked(i, set, score)).map((i) => i.id));
  return { look, level, score, progress, unlocked, ready: got.for === address };
}
