# Kin

**Money that behaves.** Send dollars across borders like a message — then make them stream, pool, and unlock by themselves.

Face ID sign-up. No app store, no seed phrase, no fees. Built on Monad with Agora AUSD and Mera passkeys.

## What you can do
- Send to `@name` or a WhatsApp link — delivered in ~1s
- Stream a live allowance to family abroad, with one-tap emergency unlock
- Run a savings circle with relatives in other countries — payouts enforced automatically
- Pool a family pot, earmark money for a school or hospital, invoice clients with milestone escrow

## Built with
- **Monad** — sub-second, low-cost settlement; all money logic in verified contracts
- **Agora AUSD** — the dollar users hold and send (gasless via EIP-3009)
- **Mera** — passkey accounts (Face ID), same account on web and Android
- **Envio HyperSync** — full activity history, notifications and receipts indexed from every Kin contract + AUSD transfers in one query (~2.5s for the whole chain history; `app/src/lib/server/history.ts`)
- **Envio HyperIndex** — `indexer/` indexes every Kin event + Kin-related AUSD transfers into typed `Account`/`Activity` entities (GraphQL; one row per person per event)
  - App history prefers it when `ENVIO_GRAPHQL_URL` is set, then HyperSync, then RPC (`indexer/README.md`)

## Why Kin fits the Consumer Products & Payments track
Each idea from the track list runs on a real contract (`contracts/src/`) with a live screen (`app/src/app/`):

| Track idea | Kin screen | Contract |
|---|---|---|
| Programmable gifts that unlock on conditions | Dated gifts: money opens itself on the day (`/gift`, `/gift/open`) | `KinGiftLink.sol` |
| Salary streaming for individuals | Live allowance: balance ticks up every second, emergency unlock (`/allowance`) | `KinStream.sol` |
| Payments inside social gestures | Split a bill (`/split`), money requests inside chat (`/messages`), pay by @name / QR / link (`/send`, `/scan`, `/claim`) | AUSD transfer (EIP-3009); `KinNames.sol` for @names; `KinEscrow.sol` for refundable claim links |
| Accountability & savings pools | Savings circles with safety deposits (`/circle`); family pots + jars that pay out by themselves at the goal (`/pot`, `/jars`); chores: parent funds, kid marks done, parent OKs (`/chores`) | `KinCircle.sol`, `KinPot.sol`, `KinEscrow.sol` |
| Milestone payments | Invoices with named parts, due dates, "mark done" per part (`/invoice`) | `KinEscrow.sol` |

Cross-border by default: everyone holds digital dollars (Agora AUSD), payments settle in ~1s on Monad, and nobody pays network fees — the user approves each payment with their passkey and Kin's relay (`app/src/app/api/relay`) submits it.

### Account layer: Mera
Mera is the entire account layer (`app/src/lib/account.ts`, `app/src/lib/keys.ts`):
- Passkey PRF → BIP-39 phrase → standard BIP-44 account (`m/44'/60'/0'/0/0`). No email, password or extension.
- Same passkey, same account on web and the Android app (RP ID = `kin-money.vercel.app`).
- Exported phrase / private key opens the same account in MetaMask or Rabby — checked by `app/scripts/check-keys.mts` against the standard `test … junk` vector.
- Explicit gas limits (estimate × 1.2, capped) because Monad bills the gas limit (`app/src/lib/server/relayer.ts`).
- Key bytes zeroed right after use; the Mera session lives in memory only.
- A read-only session token lets you browse without a passkey prompt; every payment still asks for one.
- No P-256 verifier onchain: the signing key is derived from the passkey itself.

## Repo
| Path | What |
|---|---|
| `app/` | Next.js PWA (Mera passkeys, viem, gasless relay) |
| `mobile/` | Expo / React Native Android app (same passkey and account as the web app, native screens for every feature) |
| `contracts/` | Foundry — KinForwarder, KinNames, KinEscrow, KinStream, KinPot, KinCircle, KinMandate (AutoPay), KinGiftLink (dated gifts) |
| `docs/` | Product spec, architecture, references, submission checklist |

## Run
```sh
git clone --recurse-submodules <repo>
cd contracts && forge build && forge test
cd ../app && cp .env.example .env.local && pnpm install && pnpm dev
```

Built for Monad Metropolis 2026 — Consumer Products & Payments.
