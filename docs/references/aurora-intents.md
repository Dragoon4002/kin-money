# Aurora Intents — dev reference

Checked 2026-10-12. `[V]` = seen in official docs / live API / npm (source below). `UNVERIFIED` = not confirmed.

## Products [V]

| Product | What | Fit for Kin "Add money from another chain" |
|---|---|---|
| **Swap API** | REST: quote → one-time `depositAddress` → user sends from any wallet/CEX → status poll. Same engine as widget + Deposits | **Best.** Headless, own UI, we keep invisible-blockchain copy |
| **Intents Deposits** | Deposit-address product built on Swap API (`ANY_INPUT`); widget (iframe/React) or API; persistent addresses | Good concept match, but persistent-address creation is **gated** (403 unless Aurora-approved org) [V]; widget exposes chains/tokens UI (jargon risk) |
| **Intents Connect** | Cross-chain *actions* (e.g. Solana wallet → Aave on Eth) via NEAR Chain Signatures intermediary account; user signs from origin wallet | Overkill; needs a source-chain wallet signer. Widget = early access only |
| Swap Widget | Drop-in swap UI | Not our UX |

All "powered by NEAR Intents"; persistent-deposit docs say "1Click calls" Aurora's fee service → Aurora = fee/key layer over **NEAR Intents 1Click** [V].

## Monad support

- Monad (143) = source ✅ / destination ✅ for Deposits, Swap, Connect [V]. Chain code `monad`.
- **Testnet 10143: not supported** — no testnet anywhere in docs [V by absence]. Demo must be mainnet with real funds.
- Monad assets [V, docs + live 1Click `/v0/tokens`]:
  - USDC `0x754704bc059f8c67012fed69bc8a327a5aafb603`, 6 dec, assetId `nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx`
  - USDT0 `0xe7cd86e13ac4309349f30b3435a9d337750fc82d`, assetId `nep245:v2_1.omni.hot.tg:143_4EJiJxSALvGoTZbnc8K7Ft9533et`
  - MON native, `nep245:v2_1.omni.hot.tg:143_11111111111111111111`
- **AUSD not listed** on any chain [V]. ⇒ land USDC on user's Monad address, then USDC→AUSD on Monad (Agora instant settlement / DEX — UNVERIFIED path; Monad USDC EIP-3009 for gasless follow-up — UNVERIFIED).

## API [V]

Base `https://intents-api.aurora.dev`. Auth = API key as **path segment**; key is **not secret** (client-safe). Get key: https://studio.aurora.dev (email login, issued immediately, permissionless). Analytics: https://portal.intents.aurora.dev. Rate-limited per key (429).

| Call | Endpoint |
|---|---|
| Tokens | `GET /api/tokens/{apiKey}` → `[{assetId, decimals, blockchain, symbol, price, contractAddress}]` |
| Quote (+deposit addr) | `POST /api/quote/{apiKey}` |
| Speed up detection | `POST /api/deposit/submit/{apiKey}` (tx hash) |
| Status | `GET /api/status/{apiKey}?depositAddress=…` |
| History | `GET /api/transactions/{apiKey}?walletAddress=…` |
| Incidents | `GET /api/incidents/{apiKey}` |
| Persistent addr (gated) | `POST /api/persistent-deposit-address/{apiKey}` `{recipient, sender, depositChain, destinationChain/destinationAsset, confidential}`; status `GET /api/persistent-deposit-status/{apiKey}` (WIP) |

Quote body: `{dry, swapType: EXACT_INPUT|EXACT_OUTPUT|FLEX_INPUT|ANY_INPUT, slippageTolerance (bps), originAsset, depositType: ORIGIN_CHAIN, destinationAsset, amount (smallest unit), recipient: <user Monad addr>, recipientType: DESTINATION_CHAIN, refundTo, refundType: ORIGIN_CHAIN, deadline (ISO)}`. `dry:true` = price only, no address.
Response `quote`: `depositAddress`, `depositMemo?`, `amountIn/Out(+Formatted,+Usd)`, `minAmountOut`, `minAmountIn`, `timeEstimate` (s), `deadline`, `timeWhenInactive`; `ANY_INPUT`+`depositType INTENTS` also returns `chainDepositAddresses[]` (one addr per chain, same account).
Statuses: `PENDING_DEPOSIT → KNOWN_DEPOSIT_TX → PROCESSING → SUCCESS | INCOMPLETE_DEPOSIT | REFUNDED | FAILED`.
Flow needs no approve/contract call from us: user just transfers to `depositAddress` from any wallet/exchange.

Fees [V]: integrator fee configurable (max 500 bps), split 60/40 integrator/Aurora; Aurora floor **2 bps stables**, 10 bps non-stables. Min amounts: per-quote `minAmountIn` (no global number in docs). Times: per-quote `timeEstimate` (concrete numbers UNVERIFIED).

npm [V]: `@aurora-is-near/intents-swap-widget` 7.25.1 (+`-evm`/`-solana`/`-stellar`/`-standalone`), `@aurora-is-near/intents-connect` 7.25.1, `@aurora-is-near/intents-connect-wallet` 7.25.1. No Swap-API SDK needed — plain `fetch`. Raw NEAR alternative: `@defuse-protocol/one-click-sdk-typescript` 0.1.26, `https://1click.chaindefuser.com/v0/…` (JWT optional; fee for no-JWT UNVERIFIED) — but bounty wants an *Aurora* product, so use Aurora key.

## Kin plan sketch

Server route (keeps key server-side anyway): `GET /api/tokens` once → `POST /api/quote` `EXACT_INPUT`, origin e.g. USDC Base, dest USDC Monad, recipient = user Mera address, refundTo = user-provided source addr → show "Send X to this address" + QR → poll status → on SUCCESS relay USDC→AUSD (or keep USDC). Testnet impossible; record mainnet video.

## Bounty (Monad Metropolis)

- "Bring Any-Chain Liquidity to Monad" listed on https://monad.xyz/developers/hackathons/metropolis [V title]; amount/full text on platform only (UNVERIFIED here). Aurora mentors/judges: Armand Didier (Head of Product), Chris Gutkowski (Head of Delivery) [V].
- Support: Telegram https://t.me/auroraisnear/377725, contact@aurora.dev.

## Sources
- https://docs.intents.aurora.dev/llms-full.txt (whole docs; sections: Welcome, API Keys & Fees, What is Intents Connect, Intents Connect Widget, What are Intents Deposits, Deposits API integration, Persistent Addresses, What is Swap API, Supported Assets/Chains, Swap API Reference, Persistent Addresses API Reference)
- https://docs.intents.aurora.dev/intents-swap/what-is-swap-api
- https://docs.intents.aurora.dev/intents-deposits/quickstart/api-integration
- https://docs.intents.aurora.dev/api-reference/persistent-addresses-api-reference/create-persistent-deposit-address
- https://1click.chaindefuser.com/v0/tokens (live, Monad rows)
- https://registry.npmjs.org/@aurora-is-near/intents-swap-widget (and siblings)
- https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api
