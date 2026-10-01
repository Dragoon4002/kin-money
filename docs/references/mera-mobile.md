# Mera on Expo (Android) — reference for Kin mobile

Source: category-labs/mera `demos/mobile` (Expo 57, RN 0.86) + react-native-passkey 3.6.1. Researched 2026-10-01.

- Packages: `@category-labs/mera@0.2.0`, `react-native-passkey@3.6.1` (exact), `expo-crypto`, `expo-secure-store`, viem, `@scure/bip32`, `@scure/bip39`. No metro config needed on SDK 57 (package `exports` resolve).
- Polyfill FIRST (before any viem/scure/mera import), via custom `main` entry → then `expo-router/entry`:
  ```ts
  import { getRandomValues } from "expo-crypto";
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { ...globalThis.crypto, getRandomValues } });
  ```
- Every ceremony: `webAuthnClient: reactNativeWebAuthnClient` from `@category-labs/mera/react-native-webauthn-client`.
- rpId hardcoded `kin-money.vercel.app` (web uses `location.hostname` = same). PRF salt is a library constant → same PRF → same address as web.
- Derivation identical to web: PRF → BIP39 entropy → seed → `m/44'/60'/0'/0/0`.
- Android: API 28+; no plugin/intent filter needed for passkeys. Domain link file `https://kin-money.vercel.app/.well-known/assetlinks.json` with relation `delegate_permission/common.get_login_creds`, package + SHA256 of EVERY signing cert (we sign with our own keystore `mobile/credentials/kin.jks`, gitignored, via eas.json `credentialsSource: "local"`).
- Errors: `RequestFailed` ≈ broken association; `NoCredentials` = no synced passkey; `UserCancelled` also for "no passkey" on Android. PRF works with Google Password Manager / 1Password; others may throw `PRF_UNAVAILABLE`.
- Not Expo Go — dev build (`eas build --profile development`).
