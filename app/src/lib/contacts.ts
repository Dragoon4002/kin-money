"use client";
import type { Address, Hex } from "viem";
import type { Person } from "@/components/PersonPicker";
import { getAccount } from "./account";

// Client API for the phonebook graph (/api/contacts, /api/requests).
// Auth: EIP-191 over `Kin contacts <address> <ts>`, cached 4 min (server accepts 5).

export type Contact = Person & { label: string };
export type Recent = Person & { count: number; total: string; last: number };
export type Suggestion = Person & { mutual: number };
export type Phonebook = { contacts: Contact[]; recents: Recent[]; suggested: Suggestion[] };
export type MoneyRequest = { id: string; from: Person; to: Person; amount: string; note: string; status: "open" | "paid" | "declined"; at: number };

let cached: { address: string; at: number; headers: Record<string, string> } | null = null;

/** Address from the saved profile (lib/account's public localStorage entry) — no Face ID needed. */
const savedAddress = () => {
  try {
    return (JSON.parse(localStorage.getItem("kin.account") ?? "null") as { address?: string } | null)?.address;
  } catch {
    return undefined;
  }
};

async function authHeaders(): Promise<Record<string, string>> {
  if (cached && cached.address === savedAddress() && Date.now() - cached.at < 240_000) return cached.headers;
  const account = await getAccount();
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await account.signMessage({ message: `Kin contacts ${account.address} ${ts}` });
  const headers = { "x-kin-address": account.address, "x-kin-ts": ts, "x-kin-sig": sig };
  cached = { address: account.address, at: Date.now(), headers };
  return headers;
}

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) cached = null;
  if (!res.ok) throw new Error(`network: contacts ${res.status}`);
  return res.json() as Promise<T>;
}

/** Upsert PAID edge after a confirmed payment. Fire-and-forget; never throws. */
export async function recordPayment(to: Address, amount: bigint): Promise<void> {
  await api("/api/contacts/paid", "POST", { to, amount: amount.toString() }).catch(() => {});
}

export const listContacts = () => api<Phonebook>("/api/contacts");

/** Recent + frequent people for pickers (recents first, then saved contacts). Never throws. */
export async function recentPeople(): Promise<Person[]> {
  const book = await listContacts().catch(() => null);
  if (!book) return [];
  const seen = new Set<string>();
  return [...book.recents, ...book.contacts]
    .filter((p) => p.name && !seen.has(p.address) && seen.add(p.address))
    .slice(0, 8)
    .map(({ address, name }) => ({ address, name }));
}

/** Save someone with a nickname ("Mum"). */
export const addContact = (p: Person, label = "") => api<{ ok: true }>("/api/contacts", "POST", { address: p.address, label });

/** Ask `to` for `amount` base units. */
export const createRequest = (to: Address, amount: bigint, note: string) =>
  api<{ id: string }>("/api/requests", "POST", { to, amount: amount.toString(), note });

export const listRequests = () => api<{ incoming: MoneyRequest[]; outgoing: MoneyRequest[] }>("/api/requests");

/** Payer only. "paid" needs the delivered payment's hash (server checks it). */
export const settleRequest = (id: string, status: "paid" | "declined", hash?: Hex) =>
  api<{ ok: true }>("/api/requests", "PATCH", { id, status, hash });
