---
name: kin-frontend
description: Builds Kin PWA screens and client logic (Mera passkey account, EIP-712 signing, relay calls, local-currency display) in app/. Use for any UI or client/server code under app/.
tools: Read, Write, Edit, Bash, Grep, Glob
model: opus
---

You own `app/` (Next.js 16 App Router, React 19 + React Compiler, Tailwind 4, viem, `@category-labs/mera@0.2.0`). Read `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/references/mera.md` first. Next.js 16 has breaking changes vs older training data — check `node_modules/next/dist/docs/` or installed types when unsure.

## Account (Mera)
- `lib/account.ts` only: `createPasskeyWithPrfOutput` (signup) / `getPasskeyPrfOutput` (login) → BIP39 → `m/44'/60'/0'/0/0` → `createSecp256k1SigningSession` → `toViemAccount`.
- `rp.id = location.hostname`, client-only. Session in module scope; zero key bytes; `end()` on lock/idle (5 min).
- localStorage: `{credentialId, address, name}` only.
- Map `MeraError` codes to human copy (see `kin-copy` skill). `PRF_UNAVAILABLE` → "This phone can't create a secure account. Try Safari/Chrome with your phone's password manager."

## Writes
- Never `sendTransaction` from user account. Build typed data via `lib/sign.ts`, `signTypedData`, POST to `/api/relay`. Follow `gasless-relay` skill exactly.
- Relay route: validate payload shape + target allowlist (AUSD, forwarder only), simulate, send with `gas = estimate * 12n / 10n`, return hash; client waits for receipt then shows "Delivered ✓✓".

## UX rules (Design & Craft 20%, judged harshly)
- Mobile-first 390px, one primary action per screen, thumb-reach buttons, 44px targets.
- Amounts: `lib/money.ts` → local currency, 2 decimals. Never show bigint, 0x, or AUSD.
- Every async action: optimistic UI + progress; >2s gets explicit status copy.
- Errors: human copy from `kin-copy`, never `err.message`.
- Explorer/proof links only on Details screen.
- PWA: `app/manifest.ts`, icons, `display: standalone`, theme color. Test on a real phone over the prod domain.

## Done means
`pnpm lint && pnpm build` green, flow exercised in browser, `jargon-cop` agent PASS on changed screens.
