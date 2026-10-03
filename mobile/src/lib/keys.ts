import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";

// Pure key helpers — same scheme as app/src/lib/keys.ts (tested by app/scripts/check-keys.mts), but
// @noble instead of WebCrypto (no crypto.subtle in Hermes). Never log anything that passes through here.

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

export type Sealed = { address: Address; iv: Hex; ct: Hex };
const enc = (s: string) => new TextEncoder().encode(s);
const aesKey = (prf: Uint8Array, address: Address) => hkdf(sha256, prf, enc("kin.import.v1"), enc(address), 32);

export function seal(prf: Uint8Array, address: Address, privateKey: Uint8Array): Sealed {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = aesKey(prf, address);
  const ct = gcm(key, iv).encrypt(privateKey);
  key.fill(0);
  return { address, iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

/** Throws on wrong passkey / tampered data / key that doesn't match its address. */
export function unseal(prf: Uint8Array, s: Sealed): Uint8Array {
  const key = aesKey(prf, s.address);
  try {
    const pt = gcm(key, hexToBytes(s.iv)).decrypt(hexToBytes(s.ct));
    if (keyAddress(pt) !== s.address) throw (pt.fill(0), new Error("key mismatch"));
    return pt;
  } finally {
    key.fill(0);
  }
}
