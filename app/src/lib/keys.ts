import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";

// Pure key helpers (no storage, no UI) — shared by account.ts and scripts/check-keys.mts.
// Never log anything that passes through here.

/** BIP39 phrase → m/44'/60'/0'/0/0 (MetaMask/Rabby first account). Same path Kin derives from the passkey. */
export function nodeFromPhrase(phrase: string) {
  const seed = mnemonicToSeedSync(phrase);
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  seed.fill(0);
  if (!node.privateKey) throw new Error("key derivation failed");
  return node as HDKey & { privateKey: Uint8Array };
}

export const keyAddress = (privateKey: Uint8Array): Address => privateKeyToAddress(bytesToHex(privateKey));

/** Pasted 12/24-word phrase or 0x private key → key bytes + address. null = not valid. */
export function parseSecret(input: string): { privateKey: Uint8Array; address: Address } | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  try {
    if (/^(0x)?[0-9a-f]{64}$/.test(s)) {
      const privateKey = hexToBytes(`0x${s.replace(/^0x/, "")}`);
      return { privateKey, address: keyAddress(privateKey) }; // throws if out of curve range
    }
    if (![12, 24].includes(s.split(" ").length) || !validateMnemonic(s, wordlist)) return null;
    const node = nodeFromPhrase(s);
    const privateKey = node.privateKey.slice();
    node.wipePrivateData();
    return { privateKey, address: keyAddress(privateKey) };
  } catch {
    return null;
  }
}

// --- Imported keys at rest: AES-256-GCM under HKDF-SHA256(passkey PRF, "kin.import.v1", address).
// The PRF only exists during a Face ID ceremony, so stored keys are useless without the passkey.

export type Sealed = { address: Address; iv: Hex; ct: Hex };
const SALT = new TextEncoder().encode("kin.import.v1");

async function aesKey(prf: Uint8Array, address: Address) {
  const ikm = await crypto.subtle.importKey("raw", prf as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(address) },
    ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function seal(prf: Uint8Array, address: Address, privateKey: Uint8Array): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(prf, address), privateKey as BufferSource));
  return { address, iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

/** Throws on wrong passkey / tampered data / key that doesn't match its address. */
export async function unseal(prf: Uint8Array, s: Sealed): Promise<Uint8Array> {
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(s.iv) as BufferSource }, await aesKey(prf, s.address), hexToBytes(s.ct) as BufferSource));
  if (keyAddress(pt) !== s.address) throw (pt.fill(0), new Error("key mismatch"));
  return pt;
}
