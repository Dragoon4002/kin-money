"use client";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import type { Address, LocalAccount } from "viem";

// Mera is the entire account layer: passkey PRF (32B) → BIP39 → m/44'/60'/0'/0/0 EOA.
// Key lives only in the in-memory signing session. localStorage holds public info only.

const STORE = "kin.account";
const TOKEN = "kin.session"; // read-only server session (see lib/server/session.ts) — not a key, can't move money
const PAY_CHECK = "kin.payCheck";
const IDLE_MS = 5 * 60_000;

export type Profile = { credentialId: string; address: Address; name?: string };
/** `ready` is false during SSR/hydration — never redirect before it is true. `canRead` = People/requests load without Face ID. */
export type AccountState = { profile: Profile | null; unlocked: boolean; ready: boolean; canRead: boolean };

let session: Secp256k1SigningSession | null = null;
let account: LocalAccount | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let state: AccountState = { profile: null, unlocked: false, ready: true, canRead: false };
let faceIdAt = 0;
let loaded = false;
const listeners = new Set<() => void>();

function emit(next: AccountState) {
  state = next;
  listeners.forEach((l) => l());
}

function load(): AccountState {
  if (!loaded && typeof localStorage !== "undefined") {
    loaded = true;
    const raw = localStorage.getItem(STORE);
    const profile = raw ? (JSON.parse(raw) as Profile) : null;
    state = { profile, unlocked: false, ready: true, canRead: !!tokenFor(profile?.address) };
  }
  return state;
}

function save(profile: Profile) {
  localStorage.setItem(STORE, JSON.stringify(profile));
}

function derive(prfOutput: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  seed.fill(0);
  prfOutput.fill(0);
  if (!node.privateKey) throw new Error("key derivation failed");
  return node as HDKey & { privateKey: Uint8Array };
}

function openSession(prfOutput: Uint8Array) {
  const node = derive(prfOutput);
  faceIdAt = Date.now();
  session?.end();
  session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.privateKey.fill(0);
  account = toViemAccount(session);
  touch();
  return getEvmAddress(session.publicKey) as Address;
}

/** Reset the idle lock timer. Call on user activity that signs. */
export function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lock, IDLE_MS);
}

const rp = () => ({ id: location.hostname, name: "Kin" });

export async function signUp(displayName: string): Promise<Profile> {
  const c = await createPasskeyWithPrfOutput({ rp: rp(), user: { name: displayName, displayName } });
  const address = openSession(c.prfOutput);
  const profile = { credentialId: c.credentialId, address };
  save(profile);
  emit({ profile, unlocked: true, ready: true, canRead: true });
  void startReadSession();
  return profile;
}

/** Face ID. With no saved profile, the OS shows its passkey picker (new device / reinstall). */
export async function unlock(): Promise<Profile> {
  const known = load().profile;
  const r = await getPasskeyPrfOutput({ rpId: rp().id, credential: known ? { credentialId: known.credentialId } : undefined });
  const address = openSession(r.prfOutput);
  const profile: Profile = known?.address === address ? known : { credentialId: r.credentialId, address };
  save(profile);
  emit({ profile, unlocked: true, ready: true, canRead: true });
  void startReadSession();
  return profile;
}

/** True when signing won't prompt Face ID. */
export const isUnlocked = () => account !== null;

export function lock() {
  session?.end();
  session = null;
  account = null;
  emit({ ...state, unlocked: false, canRead: !!tokenFor(state.profile?.address) });
}

export function setName(name: string) {
  if (!state.profile) return;
  const profile = { ...state.profile, name };
  save(profile);
  emit({ ...state, profile });
}

export function signOut() {
  lock();
  localStorage.removeItem(STORE);
  localStorage.removeItem(TOKEN);
  emit({ profile: null, unlocked: false, ready: true, canRead: false });
}

/** Signing account; unlocks with Face ID if the session was locked. */
export async function getAccount(): Promise<LocalAccount> {
  if (!account) await unlock();
  touch();
  return account!;
}

// --- Read session: one signature after Face ID buys 30 days of browsing People/requests without it.

/** Saved read token for `address` if unexpired (server re-checks the HMAC). */
function tokenFor(address: string | undefined): string | null {
  const t = typeof localStorage === "undefined" ? null : localStorage.getItem(TOKEN);
  const [a, exp] = t?.split(".") ?? [];
  return t && address && a === address && Number(exp) > Date.now() / 1000 ? t : null;
}
export const readToken = () => tokenFor(load().profile?.address);

/** Server rejected the token (expired/rotated secret): forget it; reads wait for the next unlock. */
export function dropReadToken() {
  localStorage.removeItem(TOKEN);
  emit({ ...state, canRead: state.unlocked });
}

async function startReadSession() {
  const t = readToken();
  if (!account || (t && Number(t.split(".")[1]) - Date.now() / 1000 > 7 * 86400)) return; // fresh enough
  try {
    const a = account;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await a.signMessage({ message: `Kin session ${a.address} ${ts}` });
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: a.address, ts, sig }) });
    if (!res.ok) return; // ponytail: no token = reads fall back to per-request signatures while unlocked
    localStorage.setItem(TOKEN, ((await res.json()) as { token: string }).token);
    emit({ ...state, canRead: true });
  } catch {}
}

// --- Payment check: when a payment needs a fresh Face ID even though Kin is unlocked.

export type PayCheck = { mode: "unlocked" | "over" | "always"; limit: string /* base units */ };
const DEFAULT_PAY_CHECK: PayCheck = { mode: "over", limit: "50000000" }; // $50

export function getPayCheck(): PayCheck {
  try {
    const p = JSON.parse(localStorage.getItem(PAY_CHECK) ?? "null") as PayCheck | null;
    return p && ["unlocked", "over", "always"].includes(p.mode) && /^\d{1,15}$/.test(p.limit) ? p : DEFAULT_PAY_CHECK;
  } catch {
    return DEFAULT_PAY_CHECK;
  }
}
export const setPayCheck = (p: PayCheck) => localStorage.setItem(PAY_CHECK, JSON.stringify(p));

/**
 * Call before signing any payment of `value`. Locked → Face ID (key isn't stored). Unlocked → Face ID again
 * if the payment check asks for it. A Face ID in the last 30s counts (e.g. the unlock that started this payment).
 */
export async function confirmPayment(value: bigint): Promise<void> {
  if (!account) return void (await unlock());
  const { mode, limit } = getPayCheck();
  const ask = mode === "always" || (mode === "over" && value > BigInt(limit));
  if (ask && Date.now() - faceIdAt > 30_000) await confirmWithFaceId();
}

/** Fresh Face ID pinned to this account's passkey. Keeps the current session; key bytes zeroed right away. */
export async function confirmWithFaceId(): Promise<void> {
  const known = load().profile;
  if (!known || !account) return void (await unlock());
  const r = await getPasskeyPrfOutput({ rpId: rp().id, credential: { credentialId: known.credentialId } });
  const node = derive(r.prfOutput);
  const address = getEvmAddress(node.publicKey!);
  node.privateKey.fill(0);
  node.wipePrivateData();
  if (address !== known.address) throw new Error("wrong account");
  faceIdAt = Date.now();
  touch();
}

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const server: AccountState = { profile: null, unlocked: false, ready: false, canRead: false };

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, load, () => server);
}

/** For signed-in-only screens: redirects to "/?next=<here>" once hydrated if there is no account. */
export function useRequireAccount(): AccountState {
  const s = useAccount();
  const router = useRouter();
  useEffect(() => {
    // Keep the deep link (pay link, QR, invoice…) so sign-up returns here with everything pre-filled.
    if (s.ready && !s.profile) router.replace(`/?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [s.ready, s.profile, router]);
  return s;
}
