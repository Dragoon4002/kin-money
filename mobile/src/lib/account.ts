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
import { RP_ID } from "./config";

// Mera is the entire account layer: passkey PRF (32B) → BIP39 → m/44'/60'/0'/0/0 EOA (same as web).
// Key lives only in the in-memory signing session. SecureStore holds public info only.

const STORE = "kin.account";
const IDLE_MS = 5 * 60_000;
const rp = { id: RP_ID, name: "Kin" };
const webAuthnClient = reactNativeWebAuthnClient;

export type Profile = { credentialId: string; address: Address; name?: string };
export type AccountState = { profile: Profile | null; unlocked: boolean };

let session: Secp256k1SigningSession | null = null;
let account: LocalAccount | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let state: AccountState | null = null;
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
    state = { profile, unlocked: false };
  }
  return state;
}

function save(profile: Profile) {
  const { credentialId, address, name } = profile;
  SecureStore.setItem(STORE, JSON.stringify({ credentialId, address, name }));
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

export async function signUp(displayName: string): Promise<Profile> {
  const c = await createPasskeyWithPrfOutput({ rp, user: { name: displayName, displayName }, webAuthnClient });
  const address = openSession(c.prfOutput);
  const profile = { credentialId: c.credentialId, address };
  save(profile);
  emit({ profile, unlocked: true });
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
  emit({ profile, unlocked: true });
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
  emit({ ...load(), unlocked: false });
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
  emit({ profile: null, unlocked: false });
}

/** Signing account; unlocks with Face ID if the session was locked. */
export async function getAccount(): Promise<LocalAccount> {
  if (!account) await unlock();
  touch();
  return account!;
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, load);
}
