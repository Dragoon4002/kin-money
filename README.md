# Kin

**Money home, in rupees, in seconds.** An Indian family with someone abroad: the student or worker sends dollars to `@mum` like a message, and she cashes out to her UPI ID.

Face ID sign-up. No app store, no seed phrase, no fees. Built on Monad with Agora AUSD and Mera passkeys.

- **Live:** https://getkin.space (the only address — passkeys are tied to it)
- **Old accounts:** made on `kin-money.vercel.app` before Oct 6? Move them at https://kin-money.vercel.app/move
- **Android APK:** https://expo.dev/artifacts/eas/vR6eFqBOM6kW3PT9lZWbQcqpKTTR_txymzqzAVWHTCA.apk — same passkey, same account as the web app
- **Videos:** [Pitch](https://youtu.be/NSLu9BcOqDg) · [Technical demo](https://youtu.be/IfDo1H1GlTs) · [Agora: AUSD send + Instant Settlement](https://youtu.be/UKuoPaF9EV0) · [Chainlink CRE workflow](https://www.loom.com/share/f55522aca73e459497087a38b6ecd539)
- **Judge notes + 3-minute tour:** `docs/SUBMISSION.md` · bounty write-ups: `docs/BOUNTIES.md`

## The core flow
1. **Sign up** with a passkey (fingerprint/face) — one prompt, no email, no extension.
2. **Send** to `@name`, QR or WhatsApp link — gasless EIP-3009 AUSD transfer, settled in ~1 s, "Delivered ✓✓" + proof link.
3. **Receive** — the receiver's phone gets "You got $X from @name" instantly.
4. **Cash out** — dollars settle through Agora Instant Settlement at its fixed price, rupee quote with fees + 1% TDS shown, one identity check (`/cashout`). The rupee leg is a labelled practice step.

## Built with
- **Agora Instant Settlement** — `KinCashoutV2` pulls AUSD (`receiveWithAuthorization`, nonce commits to every term) and swaps it at Agora's fixed price on the AUSD/CTK Instant Settlement pair (Monad testnet). The rupee payout is a labelled practice step, as the bounty asks.
- **Aurora Intents** — real-money "Add money": USDC/USDT/ETH from Base, Arbitrum, Ethereum, Optimism, Polygon or Solana → USDC on Monad → AUSD via `KinAddMoney` (mainnet, one gasless signature).
- **Chainlink CRE** — `cre/kin-orchestrator`: FX rates + due AutoPay/gift/circle/escrow jobs → one report to `KinKeeper` (testnet, run by `cre workflow simulate --broadcast`).
- **Mera** — the entire account layer: passkey PRF → BIP-39 → EVM account; same account on web and Android (RP ID `getkin.space`). Details below.
- **Alchemy** — Node API first in the RPC chain (testnet + mainnet, web + Android); Custom Webhook on testnet AUSD `Transfer` → `/api/alchemy/webhook` (HMAC-verified) → instant "You got $X" push.
- **Envio** — HyperSync for full history/receipts (testnet + mainnet, `app/src/lib/server/history.ts`); HyperIndex in `indexer/`, preferred when `ENVIO_GRAPHQL_URL` is set.
- **Monad** — ~1 s settlement; every write is a user-signed EIP-712 message submitted by Kin's relay (`app/src/app/api/relay`), so users never hold MON.

## Real money
- **Real money** switch (Me → Money): balance, send, receive, add money (Aurora → `KinAddMoney`), activity and proof on **Monad mainnet AUSD** — same passkey, same address, same gasless send. Programs stay on testnet.
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

## Contracts
Source verified on MonadVision (Sourcify, "partial" match) unless marked otherwise. Full lists: `contracts/deployments/10143.json`, `contracts/deployments/143.json`.

**Monad testnet (10143)**

| Contract | Address |
|---|---|
| KinCashoutV2 (Agora Instant Settlement, live cash-out) | `0xca36cE5954E4C4058216b19622106525A894ad37` |
| KinCashout (first version, past cash-outs) | `0xDdBc1208e84E82676bfc7452F25cecDB3B05b75a` |
| KinForwarder | `0xdF70AaC88E464c78cDe367B5d2879776C2994102` |
| KinNames | `0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476` |
| KinEscrow | `0x2F2e58b1B33B30756fa0653672B4ba10cF93a55e` |
| KinStream | `0xaF989d7acE5a015875Fb5f28b22a091D441e41DB` |
| KinPot | `0x35E381186b7f5271Bdbc6F44cb17ac8D2DA72A78` |
| KinCircle | `0x0b467a32E1A38b999134da4941caD136390c9B41` |
| KinMandate (AutoPay) | `0xe770eCfBf2D2D6b8B9c1B210B7a42B92bbA8fd53` |
| KinGiftLink (dated gifts) | `0x7ad1C20D0B96BaE5aE72462137384A1924e36BDb` |
| KinKeeper (Chainlink CRE) | `0x6096983BDD0101B82384CC6368F27C08e91e4212` |
| KinBatchExecutor (EIP-7702) | `0x06122e7b4CA3c5a576795c036663049454abA0cB` |

**Monad mainnet (143)** — AUSD `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`

| Contract | Address | Status |
|---|---|---|
| KinAddMoney (USDC → AUSD) | `0xdF70AaC88E464c78cDe367B5d2879776C2994102` | verified (partial); used by Add money |
| KinCashoutV2 | `0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476` | deployed; source not verified yet; waiting on Agora approval; not used by the app |

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
cd contracts && ~/.foundry/bin/forge build && ~/.foundry/bin/forge test
cd ../app && cp .env.example .env.local && pnpm install && pnpm dev   # pnpm build runs scripts/check-move.mjs first
```

Built for Monad Metropolis 2026 — Consumer Products & Payments.
