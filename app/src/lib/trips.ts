"use client";
import type { Address, Hex } from "viem";
import type { Person } from "@/components/PersonPicker";
import type { CategoryId } from "./categories";
import { api } from "./contacts";

// Client API for /api/trips. Money = base-unit strings on the wire, bigint in the UI.

export type TripExpense = { id: string; amount: string; note: string; category: string; at: number; by: Address; payer: Address; participants: Address[] };
export type TripSettlement = { hash: string; amount: string; at: number; from: Address; to: Address };
export type TripSummary = { id: string; name: string; members: Person[]; net: string };
export type Trip = {
  id: string; name: string; createdAt: number; by: Address; settleBy: number | null;
  members: Person[]; expenses: TripExpense[]; settlements: TripSettlement[]; reminders: { from: Address; to: Address; at: number }[];
};

export const listTrips = () => api<{ trips: TripSummary[] }>("/api/trips").then((r) => r.trips);
export const createTrip = (name: string, members: Address[]) => api<{ id: string }>("/api/trips", "POST", { name, members });
export const getTrip = (id: string) => api<Trip | null>(`/api/trips/${id}`);

export const addExpense = (id: string, e: { payer: Address; amount: bigint; participants: Address[]; note: string; category: CategoryId }) =>
  api<{ id: string }>(`/api/trips/${id}`, "POST", { action: "expense", ...e, amount: e.amount.toString() });

export const addTripMember = (id: string, address: Address) => api<{ ok: true }>(`/api/trips/${id}`, "POST", { action: "addMember", address });

/** Nudge `from` about what they owe me (server allows once per 12h). */
export const remindTrip = (id: string, from: Address) => api<{ ok: true }>(`/api/trips/${id}`, "POST", { action: "remind", from });

/** Any member sets (or clears with null) the trip's "settle by" date, unix ms. */
export const setSettleBy = (id: string, at: number | null) => api<{ ok: true }>(`/api/trips/${id}`, "POST", { action: "settleBy", at });

export const removeExpense = (id: string, expense: string) =>
  api<{ ok: true }>(`/api/trips/${id}?expense=${encodeURIComponent(expense)}`, "DELETE", {});

// A delivered payment the trip hasn't recorded yet is kept on this device and retried, so money
// that already moved is never lost from the balances.
type Unsynced = { to: Address; amount: string; hash: Hex };
const key = (id: string) => `kin.trip.${id}.unsynced`;
const readUnsynced = (id: string): Unsynced[] => {
  try {
    return JSON.parse(localStorage.getItem(key(id)) ?? "[]") as Unsynced[];
  } catch {
    return [];
  }
};
const writeUnsynced = (id: string, list: Unsynced[]) =>
  list.length ? localStorage.setItem(key(id), JSON.stringify(list)) : localStorage.removeItem(key(id));

/** Record a delivered payment `hash` (me → `to`) against the trip. Server checks it; retried later if it can't yet. */
export async function settleTrip(id: string, to: Address, amount: bigint, hash: Hex): Promise<void> {
  writeUnsynced(id, [...readUnsynced(id).filter((u) => u.hash !== hash), { to, amount: amount.toString(), hash }]);
  await syncSettlements(id);
}

/** Retry any delivered-but-unrecorded payments. Never throws. */
export async function syncSettlements(id: string): Promise<void> {
  for (const u of readUnsynced(id)) {
    const ok = await api(`/api/trips/${id}`, "POST", { action: "settle", ...u }).then(() => true, () => false);
    if (ok) writeUnsynced(id, readUnsynced(id).filter((x) => x.hash !== u.hash));
  }
}

/** Payments made from this device that the trip will count once recorded. */
export const pendingSettlements = (id: string, me: Address): TripSettlement[] =>
  readUnsynced(id).map((u) => ({ hash: u.hash, amount: u.amount, at: Date.now(), from: me, to: u.to }));
