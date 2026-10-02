import * as SecureStore from "expo-secure-store";
import type { Address } from "viem";
import type { Look } from "@/components/Kinko";
import { dropReadToken, getAccount, getProfile, readToken } from "./account";
import { API_BASE } from "./config";

// Client API for the phonebook graph (/api/contacts). Same auth as web:
// read-session Bearer token when we have one (no Face ID); else EIP-191 over
// `Kin contacts <address> <ts>`, cached 4 min (server accepts 5).

export type Person = { address: Address; name: string };

let cached: { address: string; at: number; headers: Record<string, string> } | null = null;

async function authHeaders(): Promise<Record<string, string>> {
  const token = readToken();
  if (token) return { authorization: `Bearer ${token}` };
  if (cached && cached.address === getProfile()?.address && Date.now() - cached.at < 240_000) return cached.headers;
  const account = await getAccount();
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await account.signMessage({ message: `Kin contacts ${account.address} ${ts}` });
  const headers = { "x-kin-address": account.address, "x-kin-ts": ts, "x-kin-sig": sig };
  cached = { address: account.address, at: Date.now(), headers };
  return headers;
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    cached = null;
    if (readToken()) dropReadToken();
  }
  if (!res.ok) throw new Error(`network: contacts ${res.status}`);
  return res.json() as Promise<T>;
}

/** Upsert PAID edge after a confirmed payment. Fire-and-forget; never throws. */
export async function recordPayment(to: Address, amount: bigint): Promise<void> {
  await api("/api/contacts/paid", "POST", { to, amount: amount.toString() }).catch(() => {});
}

/** Put me in the phonebook so people can find me; also sends whose invite I came from (SecureStore `kin.ref`, server keeps the first). Never throws. */
export async function registerMe(): Promise<void> {
  let ref: string | null = null;
  try {
    ref = SecureStore.getItem("kin.ref");
  } catch {}
  await api("/api/contacts/me", "POST", { ref: ref && /^[a-z0-9_]{3,20}$/.test(ref) ? ref : undefined }).catch(() => {});
}

export type Invites = { invited: { name: string; at: number }[]; invitedBy: string | null };
export const listInvites = () => api<Invites>("/api/invites");

/** Publish my Kinko look so others see my character. Fire-and-forget; never throws. */
export async function publishLook(look: Look): Promise<void> {
  await api("/api/contacts/me", "POST", { look }).catch(() => {});
}

/** Recent + frequent people (recents first, then saved contacts). Never throws. */
export async function recentPeople(): Promise<Person[]> {
  const book = await api<{ recents: Person[]; contacts: Person[] }>("/api/contacts").catch(() => null);
  if (!book) return [];
  const seen = new Set<string>();
  return [...book.recents, ...book.contacts]
    .filter((p) => p.name && !seen.has(p.address) && seen.add(p.address))
    .slice(0, 8)
    .map(({ address, name }) => ({ address, name }));
}
