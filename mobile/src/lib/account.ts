import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import type { Address, LocalAccount } from "viem";
import { API_BASE, RP_ID } from "./config";

// Mera is the entire account layer: passkey PRF (32B) → BIP39 → m/44'/60'/0'/0/0 EOA (same as web).
// Key lives only in the in-memory signing session. SecureStore holds public info only.

const STORE = "kin.account";
const TOKEN = "kin.session"; // read-only server session (app/src/lib/server/session.ts) — not a key, can't move money
const PAY_CHECK = "kin.payCheck";
const IDLE_MS = 5 * 60_000;
const rp = { id: RP_ID, name: "Kin" };
const webAuthnClient = reactNativeWebAuthnClient;

export type Profile = { credentialId: string; address: Address; name?: string };
/** `canRead` = People/requests load without Face ID. */
export type AccountState = { profile: Profile | null; unlocked: boolean; canRead: boolean };

let session: Secp256k1SigningSession | null = null;
let account: LocalAccount | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let state: AccountState | null = null;
let faceIdAt = 0;
const listeners = new Set<() => void>();

function emit(next: AccountState) {
  state = next;
  listeners.forEach((l) => l());
}

function load(): AccountState {
  if (!state) {
    let profile: Profile | null = null;
    try {
      const raw = SecureStore.getItem(STORE);
      profile = raw ? (JSON.parse(raw) as Profile) : null;
    } catch {}
    state = { profile, unlocked: false, canRead: !!tokenFor(profile?.address) };
  }
  return state;
}

function save(profile: Profile) {
  const { credentialId, address, name } = profile;
  SecureStore.setItem(STORE, JSON.stringify({ credentialId, address, name }));
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

export async function signUp(displayName: string): Promise<Profile> {
  const c = await createPasskeyWithPrfOutput({ rp, user: { name: displayName, displayName }, webAuthnClient });
  const address = openSession(c.prfOutput);
  const profile = { credentialId: c.credentialId, address };
  save(profile);
  emit({ profile, unlocked: true, canRead: true });
  void startReadSession();
  return profile;
}

/** Face ID. With no saved profile, the OS shows its passkey picker (new phone / reinstall). */
export async function unlock(): Promise<Profile> {
  const known = load().profile;
  const r = await getPasskeyPrfOutput({
    rpId: rp.id,
    credential: known ? { credentialId: known.credentialId } : undefined,
    webAuthnClient,
  });
  const address = openSession(r.prfOutput);
  const profile: Profile = known?.address === address ? known : { credentialId: r.credentialId, address };
  save(profile);
  emit({ profile, unlocked: true, canRead: true });
  void startReadSession();
  return profile;
}

/** Saved profile (public info, no Face ID). */
export const getProfile = () => load().profile;

/** True when signing won't prompt Face ID. */
export const isUnlocked = () => account !== null;

export function lock() {
  clearTimeout(idleTimer);
  session?.end();
  session = null;
  account = null;
  emit({ ...load(), unlocked: false, canRead: !!tokenFor(load().profile?.address) });
}

export function setName(name: string) {
  const s = load();
  if (!s.profile) return;
  const profile = { ...s.profile, name };
  save(profile);
  emit({ ...s, profile });
}

export async function signOut() {
  lock();
  await SecureStore.deleteItemAsync(STORE);
  await SecureStore.deleteItemAsync(TOKEN);
  emit({ profile: null, unlocked: false, canRead: false });
}

/** Signing account; unlocks with Face ID if the session was locked. */
export async function getAccount(): Promise<LocalAccount> {
  if (!account) await unlock();
  touch();
  return account!;
}

// --- Read session: one signature after Face ID buys 30 days of browsing People/requests without it.

function tokenFor(address: string | undefined): string | null {
  let t: string | null = null;
  try {
    t = SecureStore.getItem(TOKEN);
  } catch {}
  const [a, exp] = t?.split(".") ?? [];
  return t && address && a === address && Number(exp) > Date.now() / 1000 ? t : null;
}
export const readToken = () => tokenFor(load().profile?.address);

/** Server rejected the token: forget it; reads wait for the next unlock. */
export function dropReadToken() {
  void SecureStore.deleteItemAsync(TOKEN);
  const s = load();
  emit({ ...s, canRead: s.unlocked });
}

async function startReadSession() {
  const t = readToken();
  if (!account || (t && Number(t.split(".")[1]) - Date.now() / 1000 > 7 * 86400)) return; // fresh enough
  try {
    const a = account;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await a.signMessage({ message: `Kin session ${a.address} ${ts}` });
    const res = await fetch(`${API_BASE}/api/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: a.address, ts, sig }) });
    if (!res.ok) return; // ponytail: no token = reads fall back to per-request signatures while unlocked
    SecureStore.setItem(TOKEN, ((await res.json()) as { token: string }).token);
    emit({ ...load(), canRead: true });
  } catch {}
}

// --- Payment check (same as web): when a payment needs a fresh Face ID even though Kin is unlocked.

export type PayCheck = { mode: "unlocked" | "over" | "always"; limit: string /* base units */ };
const DEFAULT_PAY_CHECK: PayCheck = { mode: "over", limit: "50000000" }; // $50

export function getPayCheck(): PayCheck {
  try {
    const p = JSON.parse(SecureStore.getItem(PAY_CHECK) ?? "null") as PayCheck | null;
    return p && ["unlocked", "over", "always"].includes(p.mode) && /^\d{1,15}$/.test(p.limit) ? p : DEFAULT_PAY_CHECK;
  } catch {
    return DEFAULT_PAY_CHECK;
  }
}
export const setPayCheck = (p: PayCheck) => SecureStore.setItem(PAY_CHECK, JSON.stringify(p));

/** Call before signing any payment. Locked → Face ID. Unlocked → Face ID again if the payment check asks (a Face ID in the last 30s counts). */
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
  const r = await getPasskeyPrfOutput({ rpId: rp.id, credential: { credentialId: known.credentialId }, webAuthnClient });
  const node = derive(r.prfOutput);
  const address = getEvmAddress(node.publicKey!);
  node.privateKey.fill(0);
  node.wipePrivateData();
  if (address !== known.address) throw new Error("wrong account");
  faceIdAt = Date.now();
  touch();
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, load);
}
