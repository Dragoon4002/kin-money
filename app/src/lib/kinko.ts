"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { DEFAULT_LOOK, type Look } from "@/components/kinko/Kinko";
import { HANDLE_RE } from "./names";
import { listCircles, listEscrows, listPots, listStreams, same } from "./programs";

// Kinko closet + Kin Score. Unlocks come from real onchain history (lib/programs readers),
// plus invites (localStorage). Look is per-account in localStorage `kin.kinko.<address>`.

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

// ---------- referrals ----------

/** Store `?ref=<handle>` from the URL (first one wins). Call once on `/`. */
export function captureRef() {
  const ref = new URLSearchParams(location.search).get("ref")?.toLowerCase();
  if (ref && HANDLE_RE.test(ref) && !localStorage.getItem("kin.ref")) localStorage.setItem("kin.ref", ref);
}

/** Count an invite the user sent (unlocks the party hat for them). */
export function noteInvite() {
  localStorage.setItem("kin.invited", String(Number(localStorage.getItem("kin.invited") ?? 0) + 1));
}

// ---------- achievements (onchain, cached) ----------
// Chore = OK-gated payment someone else made to me (KinEscrow approver=parent), released.

// ponytail: 60s in-memory cache per address; fine for a closet screen, add invalidation if it feels stale.
const cache = new Map<string, { at: number; p: Promise<Set<Ach>> }>();

async function load(me: Address): Promise<Set<Ach>> {
  const got = new Set<Ach>(["joined"]);
  if (localStorage.getItem("kin.ref") || Number(localStorage.getItem("kin.invited") ?? 0) > 0) got.add("invite");
  const [streams, pots, circles, escrows] = await Promise.allSettled([listStreams(me), listPots(me), listCircles(me), listEscrows(me)]);
  if (streams.status === "fulfilled") {
    if (streams.value.some((s) => same(s.payee, me) && s.withdrawn > 0n)) got.add("allowance");
    if (streams.value.some((s) => same(s.payer, me))) got.add("gave");
  }
  if (pots.status === "fulfilled" && pots.value.some((p) => same(p.beneficiary, me) && p.round > 0n)) got.add("jar");
  if (circles.status === "fulfilled" && circles.value.some((c) => c.members.some((m) => same(m.address, me) && m.paidRound > 0 && !m.defaulted))) got.add("circle");
  if (escrows.status === "fulfilled") {
    const es = escrows.value.escrows;
    if (es.some((e) => e.kind === "chore" && e.settled && e.approved && same(e.to, me) && !same(e.from, me))) got.add("chore");
    if (es.some((e) => (e.kind === "gift" || e.kind === "link") && same(e.from, me))) got.add("gave");
  }
  return got;
}

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

// ---------- look (localStorage) ----------

const listeners = new Set<() => void>();
const looks = new Map<string, { raw: string | null; look: Look }>();
const keyOf = (a: Address) => `kin.kinko.${a.toLowerCase()}`;

function readLook(a?: Address): Look {
  if (!a) return DEFAULT_LOOK;
  const key = keyOf(a);
  const raw = localStorage.getItem(key);
  const hit = looks.get(key);
  if (hit && hit.raw === raw) return hit.look;
  let look = DEFAULT_LOOK;
  try {
    if (raw) look = { ...DEFAULT_LOOK, ...(JSON.parse(raw) as Partial<Look>) };
  } catch {}
  looks.set(key, { raw, look });
  return look;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
};

/** Kinko look, Kin Score/level and unlocked item ids for `address`. Never blocks render. */
export function useKinko(address?: Address) {
  const look = useSyncExternalStore(subscribe, () => readLook(address), () => DEFAULT_LOOK);
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
  const setLook = (next: Look) => {
    if (!address) return;
    localStorage.setItem(keyOf(address), JSON.stringify(next));
    listeners.forEach((l) => l());
  };
  return { look, setLook, level, score, progress, unlocked, achievements: set, ready: got.for === address };
}
