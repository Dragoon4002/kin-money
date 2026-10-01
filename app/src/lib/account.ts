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
const IDLE_MS = 5 * 60_000;

export type Profile = { credentialId: string; address: Address; name?: string };
/** `ready` is false during SSR/hydration — never redirect before it is true. */
export type AccountState = { profile: Profile | null; unlocked: boolean; ready: boolean };

let session: Secp256k1SigningSession | null = null;
let account: LocalAccount | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let state: AccountState = { profile: null, unlocked: false, ready: true };
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
    state = { profile: raw ? (JSON.parse(raw) as Profile) : null, unlocked: false, ready: true };
  }
  return state;
}

function save(profile: Profile) {
  localStorage.setItem(STORE, JSON.stringify(profile));
}

function openSession(prfOutput: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  seed.fill(0);
  prfOutput.fill(0);
  if (!node.privateKey) throw new Error("key derivation failed");
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
  emit({ profile, unlocked: true, ready: true });
  return profile;
}

/** Face ID. With no saved profile, the OS shows its passkey picker (new device / reinstall). */
export async function unlock(): Promise<Profile> {
  const known = load().profile;
  const r = await getPasskeyPrfOutput({ rpId: rp().id, credential: known ? { credentialId: known.credentialId } : undefined });
  const address = openSession(r.prfOutput);
  const profile: Profile = known?.address === address ? known : { credentialId: r.credentialId, address };
  save(profile);
  emit({ profile, unlocked: true, ready: true });
  return profile;
}

/** True when signing won't prompt Face ID. */
export const isUnlocked = () => account !== null;

export function lock() {
  session?.end();
  session = null;
  account = null;
  emit({ ...state, unlocked: false });
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
  emit({ profile: null, unlocked: false, ready: true });
}

/** Signing account; unlocks with Face ID if the session was locked. */
export async function getAccount(): Promise<LocalAccount> {
  if (!account) await unlock();
  touch();
  return account!;
}

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const server: AccountState = { profile: null, unlocked: false, ready: false };

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, load, () => server);
}

/** For signed-in-only screens: redirects to "/" once hydrated if there is no account. */
export function useRequireAccount(): AccountState {
  const s = useAccount();
  const router = useRouter();
  useEffect(() => {
    if (s.ready && !s.profile) router.replace("/");
  }, [s.ready, s.profile, router]);
  return s;
}
