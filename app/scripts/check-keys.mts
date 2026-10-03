// Export/import key checks. Run: node --experimental-strip-types --no-warnings scripts/check-keys.mts
import assert from "node:assert/strict";
import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { mnemonicToAccount } from "viem/accounts";
import { keyAddress, nodeFromPhrase, parseSecret, seal, unseal } from "../src/lib/keys.ts";

const HARDHAT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const PHRASE = "test test test test test test test test test test test junk";
let n = 0;
const ok = (c: unknown, m: string) => (assert.ok(c, m), n++);

// Phrase / key paste → same first account as MetaMask.
ok(parseSecret(PHRASE)?.address === HARDHAT, "phrase → MetaMask vector");
ok(parseSecret(`  ${PHRASE.toUpperCase().replace(/ /g, "  \n")} `)?.address === HARDHAT, "messy whitespace/case");
ok(parseSecret("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")?.address === HARDHAT, "0x key");
ok(parseSecret("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")?.address === HARDHAT, "bare hex key");
ok(parseSecret(PHRASE.replace(/junk$/, "test")) === null, "bad checksum rejected");
ok(parseSecret("test ".repeat(14) + "junk") === null, "15 words rejected");
ok(parseSecret("0x" + "0".repeat(64)) === null, "zero key rejected");
ok(parseSecret("0x" + "f".repeat(64)) === null, "out-of-range key rejected");
ok(parseSecret("hello") === null, "garbage rejected");

// PRF → 24 words → address: the phrase we export restores the exact account Kin signs with.
for (let i = 0; i < 5; i++) {
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const mnemonic = entropyToMnemonic(prf, wordlist);
  ok(mnemonic.split(" ").length === 24, "24 words");
  const node = nodeFromPhrase(mnemonic);
  const kinAddr = getEvmAddress(createSecp256k1SigningSession({ privateKey: node.privateKey.slice() }).publicKey);
  ok(kinAddr === mnemonicToAccount(mnemonic).address, "Kin derivation = MetaMask derivation");
  ok(parseSecret(mnemonic)?.address === kinAddr, "re-import own phrase");
  ok(keyAddress(node.privateKey) === kinAddr, "exported private key → same account");
}

// Sealed at rest.
const prf = crypto.getRandomValues(new Uint8Array(32));
const { privateKey, address } = parseSecret(PHRASE)!;
const sealed = await seal(prf, address, privateKey);
ok(Buffer.from(await unseal(prf, sealed)).equals(Buffer.from(privateKey)), "round-trip");
const wrong = prf.slice();
wrong[0] ^= 1;
await assert.rejects(unseal(wrong, sealed), "wrong PRF fails");
n++;
const flip = (h: string, i: number) => h.slice(0, i) + (h[i] === "0" ? "1" : "0") + h.slice(i + 1);
await assert.rejects(unseal(prf, { ...sealed, ct: flip(sealed.ct, 10) as `0x${string}` }), "tampered ct fails");
n++;
await assert.rejects(unseal(prf, { ...sealed, iv: flip(sealed.iv, 4) as `0x${string}` }), "tampered iv fails");
n++;
await assert.rejects(unseal(prf, { ...sealed, address: "0x1111111111111111111111111111111111111111" }), "swapped address fails");
n++;
ok((await seal(prf, address, privateKey)).iv !== sealed.iv, "fresh iv each seal");
console.log(`check-keys: ${n} ok`);
