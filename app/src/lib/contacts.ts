"use client";
import type { Address, Hex } from "viem";
import type { Person } from "@/components/PersonPicker";
import { DEFAULT_LOOK, type Look } from "@/components/kinko/Kinko";
import { Trie } from "./trie";
import { getAccount } from "./account";
import { HANDLE_RE } from "./names";

// Client API for the phonebook graph (/api/contacts, /api/requests).
// Auth: EIP-191 over `Kin contacts <address> <ts>`, cached 4 min (server accepts 5).

export type Contact = Person & { label: string };
export type Recent = Person & { count: number; total: string; last: number };
export type Suggestion = Person & { mutual: number };
export type Phonebook = { contacts: Contact[]; recents: Recent[]; suggested: Suggestion[] };
export type MoneyRequest = { id: string; from: Person; to: Person; amount: string; note: string; status: "open" | "paid" | "declined"; at: number; due: number | null; remindedAt: number | null };

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

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
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

// Public directory: every @name + its published Kinko look. Fetched once per session (no Face ID).
type Directory = { trie: Trie; looks: Map<string, Look> };
let directory: Promise<Directory> | null = null;
let dirLooks = new Map<string, Look>();
const dirListeners = new Set<() => void>();

export function loadDirectory(): Promise<Directory> {
  directory ??= fetch("/api/names")
    .then((r) => r.json())
    .then((j: { names?: string[]; looks?: Record<string, string> }) => {
      const looks = new Map<string, Look>();
      for (const [n, raw] of Object.entries(j.looks ?? {})) {
        try { looks.set(n, { ...DEFAULT_LOOK, ...(JSON.parse(raw) as Partial<Look>) }); } catch {}
      }
      dirLooks = looks;
      dirListeners.forEach((l) => l());
      return { trie: new Trie(j.names ?? []), looks };
    })
    .catch(() => ((directory = null), { trie: new Trie(), looks: new Map<string, Look>() }));
  return directory;
}

/** All Kin @names as a prefix tree. */
export const loadNameTrie = () => loadDirectory().then((d) => d.trie);

/** Subscribe to a person's published look (undefined until the directory loads / if none). */
export const subscribeDirectory = (l: () => void) => {
  dirListeners.add(l);
  void loadDirectory();
  return () => dirListeners.delete(l);
};
export const publishedLook = (name?: string) => (name ? dirLooks.get(name) : undefined);

/** Publish my Kinko look so others see my character. Fire-and-forget. */
export async function publishLook(look: Look): Promise<void> {
  await api("/api/contacts/me", "POST", { look }).catch(() => {});
}

/**
 * Put me in the phonebook so people can find me. Fire-and-forget; never throws.
 * Also tells the server whose invite link I came from (`kin.ref`); server keeps only the first.
 */
export async function registerMe(look?: Look): Promise<void> {
  const ref = localStorage.getItem("kin.ref") ?? "";
  await api("/api/contacts/me", "POST", { look, ref: HANDLE_RE.test(ref) ? ref : undefined }).catch(() => {});
}

export type Invites = { invited: { name: string; at: number }[]; invitedBy: string | null };
export const listInvites = () => api<Invites>("/api/invites");

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

/** Ask `to` for `amount` base units, optionally "pay by" `due` (unix ms). */
export const createRequest = (to: Address, amount: bigint, note: string, due: number | null = null) =>
  api<{ id: string }>("/api/requests", "POST", { to, amount: amount.toString(), note, due });

/** Nudge the payer of my open request (server allows once per 12h). */
export const remindRequest = (id: string) => api<{ ok: true }>("/api/requests", "POST", { action: "remind", id });

export const listRequests = () => api<{ incoming: MoneyRequest[]; outgoing: MoneyRequest[] }>("/api/requests");

/** Payer only. "paid" needs the delivered payment's hash (server checks it). */
export const settleRequest = (id: string, status: "paid" | "declined", hash?: Hex) =>
  api<{ ok: true }>("/api/requests", "PATCH", { id, status, hash });
