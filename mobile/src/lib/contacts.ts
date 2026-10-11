import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import type { Address, Hex } from "viem";
import type { Look } from "@/components/Kinko";
import { dropReadToken, getAccount, getProfile, readToken, ensureReadSession } from "./account";
import { API_BASE } from "./config";

// Client API for the phonebook graph (/api/contacts). Same auth as web:
// read-session Bearer token when we have one (no Face ID); else EIP-191 over
// `Kin contacts <address> <ts>`, cached 4 min (server accepts 5).

export type Person = { address: Address; name: string };

let cached: { address: string; at: number; headers: Record<string, string> } | null = null;

// Mirrors TOKEN_POSTS in app/src/lib/server/graph.ts: the only writes the read-session token may make.
const TOKEN_POSTS = ["/api/pusher/auth", "/api/inbox", "/api/contacts/me"];

async function authHeaders(method = "GET", path = ""): Promise<Record<string, string>> {
  const token = readToken();
  if (token && (method === "GET" || TOKEN_POSTS.some((p) => path.endsWith(p)))) return { authorization: `Bearer ${token}` }; // other writes: fresh signature
  void ensureReadSession(); // no token yet (or it failed earlier): fetch one now so later reads skip Face ID
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
    headers: { "content-type": "application/json", ...(await authHeaders(method, path)) },
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
export async function recordPayment(to: Address, amount: bigint, hash?: Hex): Promise<void> {
  await api("/api/contacts/paid", "POST", { to, amount: amount.toString(), hash }).catch(() => {});
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

/** Recent + frequent people for pickers (recents first, then saved contacts). Never throws. */
export function recentPeople(): Promise<Person[]> {
  return listContacts()
    .then((book) => {
      const seen = new Set<string>();
      return [...book.recents, ...book.contacts]
        .filter((x) => x.name && !seen.has(x.address) && seen.add(x.address))
        .slice(0, 8)
        .map(({ address, name }) => ({ address, name }));
    })
    .catch(() => [] as Person[]);
}

// ---------- phonebook (People tab), same shapes as web lib/contacts.ts ----------

export type Contact = Person & { label: string };
export type Recent = Person & { count: number; total: string; last: number };
export type Suggestion = Person & { mutual: number };
export type Phonebook = { contacts: Contact[]; recents: Recent[]; suggested: Suggestion[] };

// One phonebook fetch shared by Home, pickers and People (30 s TTL, per account). The last good one is also kept
// in a file per account (user decision, Oct 11) so People renders instantly and refreshes behind it. Same as web.
let bookCache: { who?: string; at: number; p: Promise<Phonebook> } | null = null;
const peopleFile = (who: string) => new File(Paths.document, `kin-people-${who.toLowerCase()}.json`);

export function listContacts(): Promise<Phonebook> {
  const who = getProfile()?.address;
  if (bookCache && bookCache.who === who && Date.now() - bookCache.at < 30_000) return bookCache.p;
  const p = api<Phonebook>("/api/contacts");
  bookCache = { who, at: Date.now(), p };
  p.then(
    (book) => {
      try {
        if (who) peopleFile(who).write(JSON.stringify(book));
      } catch {}
    },
    () => bookCache?.p === p && (bookCache = null),
  );
  return p;
}

/** Last phonebook saved on this phone for the current account, if any (no fetch). */
export function cachedContacts(): Phonebook | null {
  const who = getProfile()?.address;
  try {
    const f = who ? peopleFile(who) : null;
    return f?.exists ? (JSON.parse(f.textSync()) as Phonebook) : null;
  } catch {
    return null;
  }
}

/** Save someone with a nickname ("Mum"). */
export const addContact = (p: Person, label = "") =>
  api<{ ok: true }>("/api/contacts", "POST", { address: p.address, label }).finally(() => (bookCache = null));

// ---------- money requests (/api/requests), same shapes as web ----------

export type MoneyRequest = { id: string; from: Person; to: Person; amount: string; note: string; status: "open" | "paid" | "declined"; at: number; due: number | null; remindedAt: number | null };
export const listRequests = () => api<{ incoming: MoneyRequest[]; outgoing: MoneyRequest[] }>("/api/requests");
export const createRequest = (to: Address, amount: bigint, note: string, due: number | null = null) =>
  api<{ id: string }>("/api/requests", "POST", { to, amount: amount.toString(), note, due });
/** Nudge the payer of my open request (server allows once per 12h). */
export const remindRequest = (id: string) => api<{ ok: true }>("/api/requests", "POST", { action: "remind", id });
