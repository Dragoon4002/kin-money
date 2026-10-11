# Kin — Claude guide

Consumer cross-border money app on Monad. PWA first, Expo later. Hackathon: Monad Metropolis, Consumer Products & Payments track + Agora Payments bounty + Mera UX bounty. Deadline **2026-10-13 EOD IST** (official 10-14 09:29 IST; treat 13th as hard stop).

## Read first
- `docs/PRODUCT.md` — features (#1–20), tiers, audience, judging map, banned UI words
- `docs/ARCHITECTURE.md` — contracts, gasless design, app layout, risks
- `docs/references/{mera,agora-ausd,monad}.md` — verified facts. Trust `[V]`; re-check `UNVERIFIED` before relying on it
- `tasks/todo.md` — current plan; `tasks/lessons.md` — mistakes not to repeat

## Layout
- `app/` — Next.js 16 App Router, React 19, Tailwind 4, viem, `@category-labs/mera@0.2.0` (pinned exact; preview API)
- `contracts/` — Foundry, solc 0.8.30, OZ 5.6.1 (submodule), forge-std
- `docs/`, `tasks/`, `.claude/{agents,skills}`

## Commands
Foundry lives in `~/.foundry/bin` (`/usr/bin/forge` is an unrelated tool — never use it).
```sh
cd contracts && ~/.foundry/bin/forge build && ~/.foundry/bin/forge test
cd app && pnpm dev | pnpm build | pnpm lint
```

## Hard rules
1. **Mera is the only account layer.** Never add Privy, Dynamic, WalletConnect, injected wallets, or a server that stores keys. Kills both bounties.
2. **User never pays gas.** Every write = user signs EIP-712 (EIP-3009 auth or ERC-2771 forward request) → `/api/relay`. Never `sendTransaction` from the user's account.
3. **Invisible blockchain.** No banned words in UI (list in PRODUCT.md). Map every error to human copy. Show money as local currency, 2 decimals. Run `jargon-cop` agent after UI changes.
4. **AUSD = 6 decimals.** Testnet `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`; mainnet `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`. EIP-712 domain name `"Agora Dollar"`, version `"1"`.
5. **Monad charges gas limit.** Always set explicit `gas` = estimate × 1.2. Never hardcode huge limits.
6. **Passkey RP ID = hostname.** New hostname = new account. Demo only on the fixed prod domain.
7. **Mera session in module scope/ref only**, never serialized React state or storage. Zero key bytes after use. localStorage holds only `{credentialId, address}`. Exception (user, Oct 11): last People phonebook per account (`kin.people.<address>`, web localStorage / mobile file). Activity is never stored on device.
8. Real onchain logic only — no simulated settlement (Technical Execution is judged on it).
9. Contracts: custom errors, event per state change, `ERC2771Context`, no admin/upgradeability, a Foundry test per branch that moves money.
10. `RELAYER_PRIVATE_KEY` server-only. Never `NEXT_PUBLIC_`. Never commit `.env`.
11. `references/` = user's CONFIDENTIAL screenshots (gitignored). Use only as private design reference. Never commit, publish as artifact, upload, copy into `app/public`, or quote personal data from them.
12. **Never remove the old-hostname account move.** Prod = `getkin.space`; accounts made on `kin-money.vercel.app` (until Oct 6) can only move via it (passkeys are hostname-bound). Keep: `app/src/app/move/`, the `kin-money.vercel.app` → `/move` rule in `app/next.config.ts` (with `/api`, `/.well-known`, `/move` excluded), `app/public/.well-known/assetlinks.json`, mobile `oldAccountKey()` / `lib/move.ts`, and the Vercel project serving that hostname. `app/scripts/check-move.mjs` fails `pnpm build` if any piece goes. The submission links to it.

## Agents (`.claude/agents`)
- `kin-contracts` — write/test/deploy Solidity for Kin
- `kin-frontend` — PWA screens, Mera flows, relay calls
- `jargon-cop` — audit UI for crypto leaks (read-only)
- `pitch-writer` — demo/pitch scripts, README, user-test writeups
Global ones also useful: `typescript-reviewer`, `react-reviewer`, `blockchain-developer` (security review).

## Skills (`.claude/skills`)
- `monad-deploy` — deploy + verify contracts, sync addresses/ABIs to app
- `gasless-relay` — exact EIP-3009 / ERC-2771 signing + relay pattern
- `kin-copy` — UI vocabulary + error copy map

## Workflow
Plan in `tasks/todo.md`, check items off, add review notes. After any user correction → `tasks/lessons.md`. Verify before done: forge tests green, `pnpm build` green, flow clicked on real phone for UI work.
