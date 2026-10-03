import { useEffect, useState } from "react";
import type { Address } from "viem";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { api, recordPayment } from "@/lib/contacts";
import { same, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";
import { getMeta, setMeta, useAction, useLoad, useNow } from "./kit";

// Port of app/src/components/programs/chores.tsx. Shared by /chores and /chores/[id]: chore labels and my next step.

export type ChoreMeta = { t: string; due: number };
const choreKey = (id: bigint | string) => `kin.chore.${id}`;

/** Remember a chore's label on this phone (e.g. from a share link). */
export const keepChoreMeta = (id: bigint | string, m: ChoreMeta) => setMeta(choreKey(id), m);

/** Poster saves the label for both phones. This phone keeps a copy too. */
export function saveChoreMeta(id: bigint, m: ChoreMeta) {
  keepChoreMeta(id, m);
  void api("/api/chores", "POST", { id: String(id), title: m.t, due: m.due }).catch(() => {});
}

type Saved = Record<string, { title: string; due: number } | undefined>;
/** Labels for `ids`: the poster's saved copy, else this phone's, else "A chore". */
export function useChoreMeta(ids: bigint[]) {
  // ponytail: newest 50 only (the route's cap); older ones fall back to this phone's copy.
  const key = ids.slice(0, 50).join(",");
  const { data } = useLoad(() => api<Saved>(`/api/chores?ids=${key}`).catch((): Saved => ({})), key || undefined);
  // Chores posted before names were saved online: the poster's phone uploads its copy (server checks it's theirs).
  useEffect(() => {
    if (!data) return;
    for (const id of key.split(",")) {
      const local = id && !data[id] ? getMeta<ChoreMeta>(choreKey(id)) : null;
      if (local?.t) void api("/api/chores", "POST", { id, title: local.t, due: local.due }).catch(() => {});
    }
  }, [data, key]);
  return (id: bigint): ChoreMeta => {
    const s = data?.[String(id)];
    const local = getMeta<ChoreMeta>(choreKey(id));
    return { t: s?.title || local?.t || "A chore", due: s?.due || local?.due || 0 };
  };
}

export const dueLabel = (t: number) => {
  const d = Math.round((new Date(t * 1000).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : new Date(t * 1000).toLocaleDateString(undefined, { weekday: "long" });
};

type Fn = "ping" | "approve" | "refund";
/** What I can do next with chore `e`: a button (`fn`) or just a status. */
export type ChoreStep = { label: string; fn?: Fn; brand?: boolean; tone?: "warn" | "good" };

/** Chore state for me + the action behind its button. `done` = they've said it's done. */
export function useChore(e: Escrow, me: Address | undefined, done: boolean, onDone: () => void) {
  const now = useNow(30_000);
  const action = useAction();
  const [asked, setAsked] = useState(false);
  const iDo = same(e.to, me), iCheck = same(e.from, me);
  const expired = now >= e.expiresAt;
  const said = done || asked;

  let step: ChoreStep;
  if (e.settled) step = e.approved ? { label: "Paid", tone: "good" } : { label: "Taken back" };
  else if (iCheck && expired) step = { label: "Take it back", fn: "refund" };
  else if (iCheck && done) step = { label: "Looks good — pay", fn: "approve", brand: true };
  else if (iDo && said) step = { label: "Waiting for OK", tone: "warn" };
  else if (iDo && !expired) step = { label: "I did it!", fn: "ping", brand: true };
  else step = { label: expired ? "Time's up" : "Not done yet" };

  async function act() {
    const fn = step.fn;
    if (!fn) return;
    const ok = await action.run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, fn, [e.id]);
      if (fn === "approve") say("Paying…");
      return true;
    });
    if (!ok) return;
    if (fn === "approve") void recordPayment(e.to, e.amount);
    if (fn === "ping") setAsked(true);
    onDone();
  }

  return { ...action, step, act, iDo, said, expired };
}
