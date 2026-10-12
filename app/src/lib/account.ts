"use client";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { bytesToHex, type Address, type Hex, type LocalAccount } from "viem";
import { keyAddress, nodeFromPhrase, seal, unseal, type Sealed } from "./keys";

// Mera is the entire account layer: passkey PRF (32B) → BIP39 → m/44'/60'/0'/0/0 EOA.
// Keys live only in in-memory signing sessions. localStorage holds public info only, plus keys imported
// from other wallets sealed under the passkey PRF (user decision Oct 3; see docs/ARCHITECTURE.md Security).

const STORE = "kin.account";
const TOKEN = "kin.session"; // read-only server session (see lib/server/session.ts) — not a key, can't move money
const PAY_CHECK = "kin.payCheck";
const IMPORTED = "kin.imported"; // Imported[]
const ACTIVE = "kin.active"; // address of the imported account in use; absent = Kin account
const IDLE_MS = 5 * 60_000;

export type Profile = { credentialId: string; address: Address; name?: string };
export type Imported = Sealed & { name?: string };
/** `ready` is false during SSR/hydration — never redirect before it is true. `canRead` = People/requests load without Face ID. */
export type AccountState = { profile: Profile | null; unlocked: boolean; ready: boolean; canRead: boolean; accounts: DeviceAccount[] };
/** Every account on this device for the switcher; `kin` = the passkey's own account. */
export type DeviceAccount = { address: Address; name?: string; kin?: boolean };

/** address → signer. Kin account + every imported account, filled by unlock(), emptied by lock(). */
const signers = new Map<Address, { session: Secp256k1SigningSession; account: LocalAccount }>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let state: AccountState = { profile: null, unlocked: false, ready: true, canRead: false, accounts: [] };
let faceIdAt = 0;
let loaded = false;
const listeners = new Set<() => void>();

export const kinProfile = (): Profile | null => JSON.parse(localStorage.getItem(STORE) ?? "null");
export const importedAccounts = (): Imported[] => JSON.parse(localStorage.getItem(IMPORTED) ?? "[]");

/** The account in use: Kin, or an imported one (same credentialId — Face ID is always the Kin passkey). */
function active(): Profile | null {
  const kin = kinProfile();
  const imp = kin && importedAccounts().find((i) => i.address === localStorage.getItem(ACTIVE));
  return imp ? { credentialId: kin.credentialId, address: imp.address, name: imp.name } : kin;
}
const current = () => {
  const a = typeof localStorage === "undefined" ? undefined : active()?.address;
  return (a && signers.get(a)?.account) || null;
};

function compute(): AccountState {
  const profile = active();
  const unlocked = !!current();
  const kin = kinProfile();
  const accounts = kin ? [{ address: kin.address, name: kin.name, kin: true }, ...importedAccounts().map(({ address, name }) => ({ address, name }))] : [];
  return { profile, unlocked, ready: true, canRead: unlocked || !!tokenFor(profile?.address), accounts };
}

function refresh() {
  state = compute();
  listeners.forEach((l) => l());
}

function load(): AccountState {
  if (!loaded && typeof localStorage !== "undefined") {
    loaded = true;
    state = compute();
  }
  return state;
}

function save(profile: Profile) {
  localStorage.setItem(STORE, JSON.stringify(profile));
}
const saveImported = (list: Imported[]) => localStorage.setItem(IMPORTED, JSON.stringify(list));

function derive(prfOutput: Uint8Array) {
  const node = nodeFromPhrase(entropyToMnemonic(prfOutput, wordlist));
  prfOutput.fill(0);
  return node;
}

/** New signing session for `privateKey` (zeroed). */
function addSigner(privateKey: Uint8Array): Address {
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  const address = getEvmAddress(session.publicKey) as Address;
  signers.get(address)?.session.end();
  signers.set(address, { session, account: toViemAccount(session) });
  return address;
}

function openSession(prfOutput: Uint8Array) {
  const node = derive(prfOutput);
  faceIdAt = Date.now();
  const address = addSigner(node.privateKey);
  node.wipePrivateData();
  touch();
  return address;
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
  refresh();
  void ensureReadSession();
  return profile;
}

/** Face ID. With no saved profile, the OS shows its passkey picker (new device / reinstall). Returns the active account. */
export const unlock = () => ceremony();

/** Face ID → Kin key + every imported key into memory. `add` = a new imported key to seal first (zeroed). */
async function ceremony(add?: { privateKey: Uint8Array; name?: string }): Promise<Profile> {
  const known = kinProfile();
  const r = await getPasskeyPrfOutput({ rpId: rp().id, credential: known ? { credentialId: known.credentialId } : undefined });
  const prf = r.prfOutput.slice();
  try {
    const address = openSession(r.prfOutput);
    const profile: Profile = known?.address === address ? known : { credentialId: r.credentialId, address };
    save(profile);
    let list = importedAccounts();
    if (add) {
      const sealed = await seal(prf, keyAddress(add.privateKey), add.privateKey);
      list = [...list.filter((i) => i.address !== sealed.address), { ...sealed, name: add.name }];
      saveImported(list);
    }
    for (const imp of list) {
      try {
        addSigner(await unseal(prf, imp));
      } catch {} // ponytail: sealed under another Kin passkey (account swapped) → stays locked, still removable
    }
    if (!signers.has(active()!.address)) localStorage.removeItem(ACTIVE);
    refresh();
    void ensureReadSession();
    return active()!; // the account in use (Kin or imported) — callers name/register it
  } finally {
    prf.fill(0);
    add?.privateKey.fill(0);
  }
}

/** Seal a key from another wallet on this phone (Face ID) and switch to it. */
export async function importAccount(privateKey: Uint8Array, name?: string): Promise<void> {
  const address = keyAddress(privateKey);
  if (!kinProfile() || address === kinProfile()?.address) throw new Error("no account");
  await ceremony({ privateKey, name });
  switchAccount(address);
}

/** Use another account on this phone. Kin's own address (or unknown) = back to the Kin account. */
export function switchAccount(address: Address) {
  if (importedAccounts().some((i) => i.address === address)) localStorage.setItem(ACTIVE, address);
  else localStorage.removeItem(ACTIVE);
  refresh();
  void ensureReadSession();
}

export function removeImported(address: Address) {
  saveImported(importedAccounts().filter((i) => i.address !== address));
  signers.get(address)?.session.end();
  signers.delete(address);
  localStorage.removeItem(tokenKey(address));
  if (localStorage.getItem(ACTIVE) === address) localStorage.removeItem(ACTIVE);
  refresh();
}

/** True when signing won't prompt Face ID. */
export const isUnlocked = () => current() !== null;

export function lock() {
  clearTimeout(idleTimer);
  signers.forEach((s) => s.session.end());
  signers.clear();
  refresh();
}

export function setName(name: string) {
  const a = active();
  if (!a) return;
  const list = importedAccounts();
  if (list.some((i) => i.address === a.address)) saveImported(list.map((i) => (i.address === a.address ? { ...i, name } : i)));
  else save({ ...a, name });
  refresh();
}

/** Forgets Kin and every imported account on this device (UI confirms first). */
export function signOut() {
  importedAccounts().forEach((i) => localStorage.removeItem(tokenKey(i.address)));
  lock();
  [STORE, TOKEN, IMPORTED, ACTIVE].forEach((k) => localStorage.removeItem(k));
  refresh();
}

/** Signing account (the active one); unlocks with Face ID if the session was locked. */
export async function getAccount(): Promise<LocalAccount> {
  if (!current()) await unlock();
  touch();
  return current()!;
}

/**
 * Recovery phrase + private key of the Kin account, for use in other wallets. Always a fresh Face ID pinned to
 * this account's passkey. Never store or log the result; strings can't be zeroed, so drop them as soon as hidden.
 */
export async function revealSecrets(): Promise<{ mnemonic: string; privateKeyHex: Hex }> {
  const kin = kinProfile();
  if (!kin) throw new Error("no account");
  const r = await getPasskeyPrfOutput({ rpId: rp().id, credential: { credentialId: kin.credentialId } });
  const mnemonic = entropyToMnemonic(r.prfOutput, wordlist);
  const node = derive(r.prfOutput);
  const privateKeyHex = bytesToHex(node.privateKey);
  const address = keyAddress(node.privateKey);
  node.wipePrivateData();
  r.prfOutput.fill(0);
  if (address !== kin.address) throw new Error("wrong account");
  faceIdAt = Date.now();
  return { mnemonic, privateKeyHex };
}

// --- Read session: one signature after Face ID buys 180 days (renewed on each unlock) of browsing without it.

/** Kin account keeps the original key; imported accounts get their own. */
const tokenKey = (address: string) => (address === kinProfile()?.address ? TOKEN : `${TOKEN}.${address}`);

/** Saved read token for `address` if unexpired (server re-checks the HMAC). */
function tokenFor(address: string | undefined): string | null {
  const t = typeof localStorage === "undefined" || !address ? null : localStorage.getItem(tokenKey(address));
  const [a, exp] = t?.split(".") ?? [];
  return t && address && a === address && Number(exp) > Date.now() / 1000 ? t : null;
}
export const readToken = () => tokenFor(load().profile?.address);

/** Server rejected the token (expired/rotated secret): forget it; reads wait for the next unlock. */
export function dropReadToken() {
  const a = load().profile?.address;
  if (a) localStorage.removeItem(tokenKey(a));
  refresh();
}

let sessionTry: Promise<void> | null = null;
/** Get a read token if we're unlocked and don't have a fresh one (retried by every signed request until it sticks). */
export const ensureReadSession = () => (sessionTry ??= startReadSession().finally(() => (sessionTry = null)));

async function startReadSession() {
  const t = readToken();
  const a = current();
  if (!a || (t && Number(t.split(".")[1]) - Date.now() / 1000 > 7 * 86400)) return; // fresh enough
  try {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await a.signMessage({ message: `Kin session ${a.address} ${ts}` });
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: a.address, ts, sig }) });
    if (!res.ok) return; // ponytail: no token = reads fall back to per-request signatures while unlocked
    localStorage.setItem(tokenKey(a.address), ((await res.json()) as { token: string }).token);
    refresh();
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
  if (!current()) return void (await unlock());
  const { mode, limit } = getPayCheck();
  const ask = mode === "always" || (mode === "over" && value > BigInt(limit));
  if (ask && Date.now() - faceIdAt > 30_000) await confirmWithFaceId();
}

/** Fresh Face ID pinned to this account's passkey. Keeps the current session; key bytes zeroed right away. */
export async function confirmWithFaceId(): Promise<void> {
  const known = kinProfile();
  if (!known || !current()) return void (await unlock());
  const r = await getPasskeyPrfOutput({ rpId: rp().id, credential: { credentialId: known.credentialId } });
  const node = derive(r.prfOutput);
  const address = getEvmAddress(node.publicKey!);
  node.wipePrivateData();
  if (address !== known.address) throw new Error("wrong account");
  faceIdAt = Date.now();
  touch();
}

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const server: AccountState = { profile: null, unlocked: false, ready: false, canRead: false, accounts: [] };

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
