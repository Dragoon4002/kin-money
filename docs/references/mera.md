# Mera (Category Labs) — reference for Kin

Researched 2026-10-01. Source of truth: repo `category-labs/mera` @ `a3102f4` (2026-08-31), npm `@category-labs/mera@0.2.0`.

## Bounty

> **Best Mera-Powered UX on Monad:** Build an app on Monad where Mera is the entire account layer — no seed phrase, no extension, no custody backend.

## What it is

- TS library: passkey + WebAuthn **PRF** extension → 32 deterministic secret bytes → app derives keys (BIP-39/32) → in-memory **signing session**. No contracts, no bundler, no backend, no network calls.
- NOT a smart account. Plain EOA (secp256k1). Derivation scheme is app's choice; docs + Monad guide use BIP-39 → BIP-32 `m/44'/60'/0'/0/{i}`.
- Status: preview, API may change before 1.0. Internal security review only.
- Runtime deps: `@noble/curves`, `@noble/hashes`, `@scure/base` (2.2.0). License MIT OR Apache-2.0.

## Install

```sh
npm install @category-labs/mera viem @scure/bip32 @scure/bip39
```

- Package: `@category-labs/mera` (versions 0.1.0 2026-07-23, 0.2.0 2026-08-12). ESM only (`"type": "module"`).
- Entry points: `@category-labs/mera`, `@category-labs/mera/viem`, `@category-labs/mera/react-native-webauthn-client`.
- Optional peers: `viem ^2.28.0`, `react-native-passkey 3.6.1` (exact).
- Repo: https://github.com/category-labs/mera (`library/`, `demos/{web,extension,mobile,prf}`, `docs/`). Docs: https://mera.category.xyz

## API (exact, from `library/src/*.ts`)

Exports from `@category-labs/mera` (`library/src/index.ts`):
`createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`, `createSecp256k1SigningSession`, `createEd25519SigningSession`, `getEvmAddress`, `getSolanaAddress`, `createSecretVaultWithNewPasskey`, `createSecretVaultWithExistingPasskey`, `decryptSecretVaultWithPasskey`, `parseSecretVault`, `MeraError`, `isMeraError`; types `PasskeyCredentialMetadata`, `PasskeySecretVault`, `Secp256k1SigningSession`, `WebAuthnClient`, `EvmAddress`, `MeraErrorCode`, ...

### Register (create passkey + first PRF) — `passkey.ts`

```ts
createPasskeyWithPrfOutput(opts: {
  rp: { id: string; name: string };          // id required
  user: { name: string; displayName: string };
  timeout?: number;
  prfSalt?: Uint8Array;                      // 32 bytes; default sha256("mera.prf.salt.v1"), stable forever
  webAuthnClient?: WebAuthnClient;           // default: navigator.credentials
}): Promise<{
  credentialId: string;                      // base64url, unpadded
  transports?: readonly string[];
  prfSalt: Uint8Array;                       // 32
  prfOutput: Uint8Array;                     // 32
}>
```
- Fixed params: ES256/RS256, attestation `none`, residentKey required, UV required. Fresh random 32-byte `user.id` every call → **every call creates a NEW passkey** (never overwrites).
- 1 prompt; if authenticator doesn't evaluate PRF at create, does a fallback assertion → **2nd prompt**.
- If failure happens after create, passkey stays on authenticator (orphan).

### Login (assertion + PRF) — `passkey.ts`

```ts
getPasskeyPrfOutput(opts: {
  rpId: string;
  credential?: { credentialId: string; transports?: readonly string[] }; // omit → browser picker (discoverable)
  prfSalt?: Uint8Array;                     // must match salt used at create to get same account
  timeout?: number;
  webAuthnClient?: WebAuthnClient;
}): Promise<{ credentialId: string; prfOutput: Uint8Array }>
```
- 1 prompt. UV always required (not configurable). Same credential + rpId + salt → same 32 bytes on every synced device.

### Derive secp256k1 key / address

Library does NOT derive; app does. Pattern (Monad guide / docs `getting-started.mdx`):
```ts
const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist)); // 32B → 24-word phrase (exportable)
const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${i}`);
```
`getEvmAddress(publicKey: Uint8Array): \`0x${string}\`` — EIP-55, accepts compressed/uncompressed.

### Signing session — `secp256k1.ts`, `types.ts`

```ts
createSecp256k1SigningSession({ privateKey: Uint8Array /*32*/ }): Secp256k1SigningSession
type Secp256k1SigningSession = {
  publicKey: Uint8Array;                           // 65B uncompressed
  signDigest(digest32: Uint8Array): Promise<{ compact: Uint8Array /*r||s*/; recovery: 0 | 1 }>; // no prehash, low-S
  end(): void;                                     // zeroes key; later sign → SESSION_ENDED
  [Symbol.dispose](): void;                        // `using session = ...`
}
```
- Session copies key; zero your own copy (`privateKey.fill(0)`). Signing never prompts. Re-signing after `end()` needs a new ceremony.

### Encrypted vault — `secret.ts` (for wrapping an EXISTING secret; not needed for pure passkey accounts)

```ts
createSecretVaultWithNewPasskey({ rp, user, timeout?, webAuthnClient?, secret: Uint8Array }): Promise<PasskeySecretVault>
createSecretVaultWithExistingPasskey({ rpId, credential?, timeout?, webAuthnClient?, secret }): Promise<PasskeySecretVault>
decryptSecretVaultWithPasskey({ rpId, vault, timeout?, webAuthnClient? }): Promise<Uint8Array>
parseSecretVault(value: unknown): PasskeySecretVault   // validates untrusted JSON
type PasskeySecretVault = { version: 1; credential: {credentialId, transports?}; prfSalt; nonce; ciphertext } // base64url strings
```
- Random 32B PRF salt per vault → HKDF(info `mera.v1.encrypt.secret`) → AES-256-GCM. JSON-safe; store anywhere (localStorage, server blob).

### Errors — `errors.ts`
`MeraError.code`: `PASSKEY_OPERATION_FAILED` (cancel/unavailable), `CRYPTO_UNAVAILABLE` (no getRandomValues/subtle; not secure ctx), `PRF_UNAVAILABLE` (authenticator lacks PRF), `SESSION_ENDED`, `DECRYPT_FAILED`, `INPUT_INVALID`, `VAULT_FORMAT_INVALID`.

### WebAuthnClient (custom ceremony hook)
`{ createCredential(req), getCredential(req) }` — pass as `webAuthnClient`. Homeward uses it to request a 2nd PRF salt in the same ceremony (see below).

## viem wiring — `library/src/viem.ts`

```ts
toViemAccount(session: Secp256k1SigningSession, opts?: { nonceManager?: NonceManager }): LocalAccount<"mera">
```
Implements `sign` (raw hash), `signMessage` (EIP-191), `signTypedData` (EIP-712), `signTransaction` (custom serializer ok, 4844 ok), `signAuthorization` (EIP-7702). Plug into `createWalletClient({ account, chain: monadTestnet, transport: http() })`.

Monad: chain IDs `143` (`monad`), `10143` (`monadTestnet`) from `viem/chains`. **Monad charges declared gasLimit, not gas used** → pass explicit `gas` (per docs.monad.xyz/guides/mera).

## Minimal working snippet (Next.js client component)

Adapted from https://docs.monad.xyz/guides/mera + `homeward/web/src/lib/keys.ts` + docs `recipes/create-passkey-accounts.mdx`.

```ts
"use client";
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession, isMeraError } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { createWalletClient, http, parseEther } from "viem";
import { monadTestnet } from "viem/chains";

const RP = { id: location.hostname, name: "Kin" }; // call only in browser
const KEY = "kin.credential";

function sessionFrom(prfOutput: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  seed.fill(0); prfOutput.fill(0);
  if (!node.privateKey) throw new Error("no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.privateKey.fill(0);
  return session;
}

export async function signUp(name: string) {
  const c = await createPasskeyWithPrfOutput({ rp: RP, user: { name, displayName: name } });
  localStorage.setItem(KEY, JSON.stringify({ credentialId: c.credentialId, transports: c.transports }));
  return sessionFrom(c.prfOutput);
}

export async function signIn() {
  const known = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? undefined;
  const r = await getPasskeyPrfOutput({ rpId: RP.id, credential: known }); // no known → OS picker (new device)
  localStorage.setItem(KEY, JSON.stringify(known?.credentialId === r.credentialId ? known : { credentialId: r.credentialId }));
  return sessionFrom(r.prfOutput);
}

export async function send(session: ReturnType<typeof sessionFrom>, to: `0x${string}`) {
  const client = createWalletClient({ account: toViemAccount(session), chain: monadTestnet, transport: http() });
  return client.sendTransaction({ to, value: parseEther("0.01"), gas: 21_000n });
}
// errors: isMeraError(e) && e.code === "PRF_UNAVAILABLE" → tell user to use iCloud Keychain / Google PM / 1Password
```

Next.js notes: `browserWebAuthnClient` reads `globalThis.navigator` lazily, so importing mera in SSR won't crash, but `location.hostname` must be read client-side only. Session lives in memory only — don't put it in React state that serializes; keep in a module/ref. Cache only `{address, credentialId}` in localStorage for a "locked" view (pattern from `demos/web/src/account.ts`).

## Browser / authenticator PRF support (docs `authenticator-support.md`, tested by Category Labs)

| Authenticator | Browser/OS | Status |
|---|---|---|
| iCloud Keychain | Safari iOS 18+ / macOS 15+ | ✓ (Safari 18, 2024-09) |
| iCloud Keychain | Chrome on iOS 18+ | ✓ |
| iCloud Keychain | Chrome macOS 15+ (132+), Firefox macOS (139+) | ✓ |
| Google Password Manager | Chrome Android | ✓ |
| Google Password Manager | Chrome desktop, signed-in (132+) | ✓ |
| **Chrome local profile** | Chrome desktop | **✗** |
| Windows Hello/PM | Edge/Chrome 147+/Firefox 148+ on Win11 25H2+ | ✓ |
| 1Password | any | ✓ |
| Proton Pass | Chrome desktop | ✓ |
| Bitwarden, Dashlane | Chrome desktop | ✗ |
| YubiKey 5.2+ | Chrome 116+ | ✓ |

- **Desktop Chrome gotcha:** only passkeys saved to Google Password Manager have PRF. If "Offer to save passwords and passkeys" is off, or a PM extension (Bitwarden/Dashlane) intercepts, passkey is created with no PRF → `PRF_UNAVAILABLE` (and an orphan passkey remains).
- Native: iOS 18+, Android 9+.
- Dev/CI: Chrome CDP virtual authenticator with `hasPrf: true` works for e2e (used in mandate PR #8), but can't prove cross-device sync.

## RP ID / domain gotchas

- rpId = hostname (no scheme/port/path). Passkey + all derived accounts are bound to it. **Change domain = lose accounts** (unless user exported phrase). Pick the final prod domain before demo day.
- Secure context required: HTTPS, or `localhost` in dev. `http://192.168.x.x` (LAN phone testing) fails; IPs are not valid rpIds (UNVERIFIED for Mera specifically; WebAuthn spec rule). Use an HTTPS tunnel — but tunnel hostname is a different rpId → different accounts.
- `localhost` passkeys are separate from prod passkeys (different rpId → different address).
- **Vercel previews:** every preview URL (`kin-git-branch-x.vercel.app`) is a distinct rpId → different account per preview. `vercel.app` is on the Public Suffix List so it can't be used as a shared rpId (UNVERIFIED, from general knowledge). Fix: custom domain, rpId = `kin.example.com` (or parent `example.com` to cover subdomains — rpId may be a registrable suffix of the origin per WebAuthn spec).
- Related Origin Requests (`/.well-known/webauthn`) to share across unrelated domains — not mentioned by Mera; UNVERIFIED/avoid.
- WebKit refuses passkey creation in a cross-origin iframe (comment in `demos/web/vite.config.ts`). Don't embed the create flow in an iframe.
- Security: any script on the rpId origin can run a ceremony and read PRF output → strict CSP, minimal third-party scripts (docs `concepts/security-model.mdx`).

## Recovery / multi-device

- Passkeys sync via iCloud Keychain / Google PM / 1Password → same PRF → same address on every synced device, zero server state. New device: `getPasskeyPrfOutput({ rpId })` with no `credential` → OS picker.
- Cross-ecosystem (iPhone ↔ Windows) via hybrid/QR works for signing (PRF over hybrid UNVERIFIED in docs table).
- Loss of passkey (deleted, unsynced provider, domain move) = loss of accounts. Only recovery: app-provided export while passkey works. BIP-39 route gives a 24-word phrase from `entropyToMnemonic(prfOutput)` → importable into MetaMask etc. (Homeward `exportPhrase()` gates this behind a fresh ceremony).
- Each `createPasskeyWithPrfOutput` call = new passkey = new account. Guard sign-up UI against double-creation; offer "sign in" first.
- Multiple keys from one passkey: use different `prfSalt` per namespace (Homeward: account vs private salts; mandate: `sha256("mandate:policy:...")`), or HKDF off one output.

## Expo / React Native (later)

- `npm i @category-labs/mera react-native-passkey@3.6.1`; needs dev client (native module), not Expo Go.
- Hermes lacks `crypto.getRandomValues` → polyfill with `expo-crypto` before importing mera:
  ```ts
  import { getRandomValues } from "expo-crypto";
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { ...globalThis.crypto, getRandomValues } });
  ```
- Pass `webAuthnClient: reactNativeWebAuthnClient` (from `@category-labs/mera/react-native-webauthn-client`) to every ceremony.
- Domain linking on the rpId host (HTTPS, no redirect): iOS `/.well-known/apple-app-site-association` `{"webcredentials":{"apps":["TEAMID.bundle.id"]}}` + Associated Domain `webcredentials:<rpId>`; Android `/.well-known/assetlinks.json` with `delegate_permission/common.get_login_creds` + all signing cert SHA256s. Same rpId as the PWA → **same passkey/account on web and app**.
- Planckify app: `Passkey.getImmediate` swap for silent "no passkey" probe; checks `NativeModules.Passkey` to detect unlinked module (`services/walletKit/evm/mera/passkeyWallet.ts`). Official demo: `demos/mobile` (Expo 57, expo-secure-store caches PRF output).

## Example integrations

- **Homeward** (React PWA) `web/src/lib/keys.ts`: custom `WebAuthnClient` evaluating 2 PRF salts per ceremony (account key + AES vault/x25519 inbox key via HKDF); `toViemAccount`; idle (10 min) / hidden (2 min) session auto-end; step-up `confirmWithPasskey`; `exportPhrase`. Best reference for Kin.
- **Planckify / TakumiPay** (Expo RN): `services/walletKit/evm/mera/{passkeyWallet,derive,errors}.ts`, rpId `takumipay.xyz`.
- **mandate PR #8**: PRF namespaces → HKDF → AES-GCM policy vault + secp256k1 identity keys; pins `@category-labs/mera@0.2.0` exactly; verified npm SLSA provenance → tag v0.2.0 commit `290cddd2…`.

## Sources

- https://github.com/category-labs/mera (library/src/{index,passkey,secp256k1,secret,viem,errors,types,webauthn}.ts; docs/src/content/docs/**)
- https://www.npmjs.com/package/@category-labs/mera (`npm view @category-labs/mera`)
- https://mera.category.xyz/ · https://mera.category.xyz/authenticator-support/ · https://mera.category.xyz/demo/
- https://www.category.xyz/blogs/mera-crypto-onboarding-with-only-a-passkey-on-any-network
- https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets
- https://docs.monad.xyz/guides/mera (+ `/guides/mera/react-native`, not fetched)
- https://github.com/neromtoobad/homeward (web/src/lib/keys.ts)
- https://github.com/Planckify-Labs/monad-submission-mobile-app (services/walletKit/evm/mera/passkeyWallet.ts)
- https://github.com/aliveevie/mandate/pull/8
