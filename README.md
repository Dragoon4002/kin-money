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

## Repo
| Path | What |
|---|---|
| `app/` | Next.js PWA (Mera passkeys, viem, gasless relay) |
| `contracts/` | Foundry — KinForwarder, KinNames, KinEscrow, KinStream, KinPot, KinCircle |
| `docs/` | Product spec, architecture, references, submission checklist |

## Run
```sh
git clone --recurse-submodules <repo>
cd contracts && forge build && forge test
cd ../app && cp .env.example .env.local && pnpm install && pnpm dev
```

Built for Monad Metropolis 2026 — Consumer Products & Payments.
