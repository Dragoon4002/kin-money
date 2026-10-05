# Kin

**Money home, in rupees, in seconds.** An Indian family with someone abroad: the student or worker sends dollars to `@mum` like a message, and she cashes out to her UPI ID.

Face ID sign-up. No app store, no seed phrase, no fees. Built on Monad with Agora AUSD and Mera passkeys.

- **Live:** https://getkin.space (the only address — passkeys are tied to it)
- **Old accounts:** made on `kin-money.vercel.app` before Oct 6? Move them at https://kin-money.vercel.app/move
- **Android APK:** `TODO(paste final APK link)` — same passkey, same account as the web app
- **Judge notes + 3-minute tour:** `docs/SUBMISSION.md` · bounty write-ups: `docs/BOUNTIES.md`

## The core flow
1. **Sign up** with a passkey (fingerprint/face) — one prompt, no email, no extension.
2. **Send** to `@name`, QR or WhatsApp link — gasless EIP-3009 AUSD transfer, settled in ~1 s, "Delivered ✓✓" + proof link.
3. **Receive** — the receiver's phone gets "You got $X from @name" instantly.
4. **Cash out to UPI** — live quote at Agora's fixed price, payout fee + 1% TDS shown, one identity check (`/cashout`).

## Built with
- **Agora Instant Settlement** — `KinCashout` pulls AUSD (`receiveWithAuthorization`) and swaps it at Agora's fixed price on the AUSD/CTK Instant Settlement pair (Monad testnet). The rupee payout is a labelled practice step, as the bounty asks.
- **Mera** — the entire account layer: passkey PRF → BIP-39 → EVM account; same account on web and Android (RP ID `getkin.space`). Details below.
- **Alchemy** — Node API first in the RPC chain (testnet + mainnet, web + Android); Custom Webhook on testnet AUSD `Transfer` → `/api/alchemy/webhook` (HMAC-verified) → instant "You got $X" push.
- **Envio** — HyperSync for full history/receipts (testnet + mainnet, `app/src/lib/server/history.ts`); HyperIndex in `indexer/`, preferred when `ENVIO_GRAPHQL_URL` is set.
- **Monad** — ~1 s settlement; every write is a user-signed EIP-712 message submitted by Kin's relay (`app/src/app/api/relay`), so users never hold MON.

## Real money
- **Real money** switch (Me → Money): balance, send, receive, activity and proof on **Monad mainnet AUSD** — same passkey, same address, same gasless send. Programs stay on testnet.
- **Real cash-out (planned, not yet tested end to end):** LayerZero bridge Monad → Ethereum (or a cheaper chain) → licensed INR partner (e.g. Onramp), or Agora's mainnet Instant Settlement pair. Kin is **in onboarding with Agora** (Via endpoint offered).

## Beyond one-off sends: money that behaves
Each idea from the Consumer Products & Payments track runs on a real contract (`contracts/src/`) with a live screen (`app/src/app/`):

| Track idea | Kin screen | Contract |
|---|---|---|
| Programmable gifts that unlock on conditions | Dated gifts: money opens itself on the day (`/gift`, `/gift/open`) | `KinGiftLink.sol` |
| Salary streaming for individuals | Live allowance: balance ticks up every second, emergency unlock (`/allowance`) | `KinStream.sol` |
| Payments inside social gestures | Split a bill (`/split`), money requests inside chat (`/messages`), pay by @name / QR / link (`/send`, `/scan`, `/claim`) | AUSD transfer (EIP-3009); `KinNames.sol` for @names; `KinEscrow.sol` for refundable claim links |
| Accountability & savings pools | Savings circles with safety deposits (`/circle`); family pots (single-use invite links) + jars that pay out by themselves at the goal (`/pot`, `/jars`); chores: parent funds, kid marks done, parent OKs (`/chores`) | `KinCircle.sol`, `KinPot.sol`, `KinEscrow.sol` |
| Milestone payments | Invoices with named parts, due dates, "mark done" per part (`/invoice`) | `KinEscrow.sol` |

### Account layer: Mera
Mera is the entire account layer (`app/src/lib/account.ts`, `app/src/lib/keys.ts`):
- Passkey PRF → BIP-39 phrase → standard BIP-44 account (`m/44'/60'/0'/0/0`). No email, password or extension.
- Exported phrase / private key opens the same account in MetaMask or Rabby — checked by `app/scripts/check-keys.mts` against the standard `test … junk` vector.
- Explicit gas limits (estimate × 1.2, capped) because Monad bills the gas limit (`app/src/lib/server/relayer.ts`).
- Key bytes zeroed right after use; the Mera session lives in memory only.
- A read-only session token lets you browse without a passkey prompt; every payment still asks for one.
- No P-256 verifier onchain: the signing key is derived from the passkey itself.

## Contracts (Monad testnet 10143, verified)
Full list: `contracts/deployments/10143.json`.

| Contract | Address |
|---|---|
| KinCashout (Agora Instant Settlement) | `0xDdBc1208e84E82676bfc7452F25cecDB3B05b75a` |
| KinForwarder | `0xdF70AaC88E464c78cDe367B5d2879776C2994102` |
| KinNames | `0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476` |
| KinEscrow | `0x2F2e58b1B33B30756fa0653672B4ba10cF93a55e` |
| KinStream | `0xaF989d7acE5a015875Fb5f28b22a091D441e41DB` |
| KinPot | `0x35E381186b7f5271Bdbc6F44cb17ac8D2DA72A78` |
| KinCircle | `0x0b467a32E1A38b999134da4941caD136390c9B41` |
| KinMandate (AutoPay) | `0xe770eCfBf2D2D6b8B9c1B210B7a42B92bbA8fd53` |
| KinGiftLink (dated gifts) | `0x7ad1C20D0B96BaE5aE72462137384A1924e36BDb` |

## Repo
| Path | What |
|---|---|
| `app/` | Next.js PWA (Mera passkeys, viem, gasless relay) |
| `mobile/` | Expo / React Native Android app (same passkey and account as the web app) |
| `contracts/` | Foundry — the contracts above |
| `indexer/` | Envio HyperIndex |
| `docs/` | Product spec, architecture, references, submission notes |

## Run
```sh
git clone --recurse-submodules <repo>
cd contracts && forge build && forge test
cd ../app && cp .env.example .env.local && pnpm install && pnpm dev
```

Built for Monad Metropolis 2026 — Consumer Products & Payments.
