# Kin — Bounty write-ups (paste into the submission form)

Live: https://getkin.space · Android APK: see README · Network: Monad testnet (10143), real-money mode on Monad mainnet (143).

Contracts — testnet 10143 (source verified on MonadVision/Sourcify, "partial" match = bytecode matches, metadata not byte-identical): KinForwarder `0xdF70…4102` · KinNames `0x1cA3…8476` · KinEscrow `0x2F2e…a55e` · KinStream `0xaF98…41DB` · KinPot `0x35E3…2A78` · KinCircle `0x0b46…9B41` · KinMandate `0xe770…fd53` · KinGiftLink `0x7ad1…6BDb` · KinKeeper (CRE) `0x6096…4212` · **KinCashoutV2 (live cash-out) `0xca36cE5954E4C4058216b19622106525A894ad37`** · KinCashout V1 (first version, past cash-outs) `0xDdBc1208e84E82676bfc7452F25cecDB3B05b75a`. Full list: `contracts/deployments/10143.json`.

Contracts — mainnet 143: **KinAddMoney `0xdF70AaC88E464c78cDe367B5d2879776C2994102`** (USDC → AUSD, Sourcify partial match; 2 real relayed conversions so far) · **KinCashoutV2 `0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476`** (deployed, source not yet verified, not yet approved by Agora on the mainnet pair, not used by the app — real cash-out shows "Coming soon"). `contracts/deployments/143.json`.

---

## 1. Agora — Best Cross-Border Payments App on Monad

**Describe the core features of your app with a focus on how it enables a user to send AUSD to another person or across borders.**

Kin is a mobile money app for one person: someone in India whose family is abroad (a parent funding a student, a worker sending home). AUSD is the only money in the app. Users see it as dollars and in their own currency, and never see a wallet, gas or a chain.

- **Onboarding in one step:** a Mera passkey (fingerprint or face) creates the account. There's no seed phrase, no extension and no email, and the same account works on web and Android.
- **AUSD balance:** shown in local currency (₹, $, AED…), with practice AUSD from Agora's testnet faucet on signup.
- **Send across borders:** by `@name`, by scanning a QR, or by WhatsApp link to someone not on Kin yet (refundable after 7 days). The user signs an **EIP-3009 `transferWithAuthorization`** on AUSD with their passkey. Our relayer submits it and pays the gas, so the user holds no MON and sends are free. Settlement is instant (~1 s on Monad), with a "Delivered ✓✓" receipt and proof link.
- **Receive:** a personal QR (EIP-681), so other wallets can pay AUSD too. Incoming money pushes "You got $X from @name" instantly (Alchemy webhook).
- **Cash out via Agora Instant Settlement (practice, testnet):**
  1. The user enters an amount and sees the route AUSD → USDC → INR: Agora's fixed price, then rupees after fees and 1% TDS (Onramp sandbox quote; Kin's own estimate if it's unavailable).
  2. One identity check signs a gasless EIP-3009 `receiveWithAuthorization` whose nonce commits to every term (recipient, venue, minimum out, payout reference, salt), so the relayer can't change any of them.
  3. **KinCashoutV2** pulls the AUSD and **swaps it at Agora's fixed price on the Instant Settlement pair** on Monad testnet (AUSD/CTK `0x1Aa8…b0ae`; contract approved via Agora's testnet Whitelister — `hasRole("APPROVED_SWAPPER")` = true).
  4. It emits `CashedOut(id, user, to, venue, ausdIn, settledOut, payoutRef)`. Nothing is held in the contract.
  5. The rupee payout is labelled "Practice cash-out", as the bounty asks ("mock movements of funds using the Instant Settlement contract on Monad testnet").
- **Real money mode:** a switch in Settings moves balance, send, receive, add money, activity and proof to **Monad mainnet AUSD**. The same passkey gives the same address, and the same gasless EIP-3009 send is used (domain `"Agora Dollar"` v1, chainId 143). KinCashoutV2 is already deployed on mainnet (`0x1cA3…8476`; venues: Agora AUSD/USDC pair, waiting on Agora's mainnet approval, and Uniswap v4 AUSD/USDC, fork-tested on mainnet); the app doesn't use it yet. The production cash-out path is: **LayerZero (OFT) bridge Monad → Ethereum (or a cheaper chain)** → INR payout partner (Agora's CEO, Nick van Eck, advised this route), or Agora's mainnet AUSD/USDC Instant Settlement pair → an INR off-ramp.
- **Beyond one-off sends:** money that behaves: per-second allowance streams with emergency unlock, savings circles, family pots, bills payable only to a named payee, and invoices with milestones. All of it settles in AUSD on our own contracts.

**Why it can break out:** India is the world's largest remittance market. Kin is free and instant, needs no app store or KYC to start, and every send recruits the receiver.

**Demo video (≤2 min):** passkey signup → AUSD balance → send to `@name`, delivered in ~1 s → receiver's "You got $X" → practice cash-out through Agora Instant Settlement → proof on the explorer. Link: `TODO(founder): paste video URL`.

---

## 2. Monad Foundation — Best Mera-Powered UX

Mera is Kin's **entire account layer**. There's no Privy, Dynamic, WalletConnect or injected wallet, and no server ever holds a key.

- **Signup:** `createPasskeyWithPrfOutput` → PRF → BIP-39 → EVM account. One fingerprint or face prompt creates the account, and the user picks an `@name`.
- **Every payment:** an EIP-712 signature (EIP-3009 for AUSD, ERC-2771 forward requests for our contracts) from a Mera signing session, confirmed with the passkey ("Identity check"). The relayer pays gas, so the user never sees it.
- **Same passkey, web and Android:** the RP ID is `getkin.space`, with Digital Asset Links, so the native app (Credential Manager) opens the same account.
- **Sessions stay in memory only.** Key bytes are zeroed after use, and local storage holds only `{credentialId, address}`.
- **Fewer prompts:** a read-only session token lets you browse without a prompt. The passkey is asked only when money moves, and users choose: every payment, under an amount, or always.
- **Recovery:** export the recovery phrase or private key behind a fresh identity check.
- **Invisible blockchain:** no crypto words in the UI. Errors map to plain copy, and money shows in local currency.

---

## 3. Alchemy — Best Projects using Alchemy

**Describe how your project meaningfully integrates one or more of Alchemy's services or tools.**

1. **Node API (Monad testnet + mainnet), on web and Android.** Alchemy's Monad endpoint is first in Kin's RPC chain for every balance read, receipt wait, simulation and gas estimate, including the relayer's pre-flight checks (the relayer broadcasts the signed transaction through Monad's RPC). Public RPCs stay as fallback. Before this, public-RPC 429s broke pages under load. The same key serves both networks, so Kin's real-money mode (mainnet) and practice mode (testnet) share one provider. Code: `app/src/lib/chain.ts`, `mobile/src/lib/config.ts`.
2. **Custom Webhooks (GraphQL) → instant payment notifications.** One webhook on Monad testnet streams every AUSD `Transfer` log (filtered by contract + topic in GraphQL) the moment its block lands. `/api/alchemy/webhook` verifies `X-Alchemy-Signature` (HMAC-SHA256), turns the logs into our history records, and pushes "You got $X from @name" to the receiver's phone and web. It shares the "first to index a log notifies" store with our scanner, so each payment notifies **exactly once**. This replaced polling for the money-received moment, the most emotional moment in a remittance app. Code: `app/src/app/api/alchemy/webhook/route.ts`, `app/src/lib/server/history.ts`.

**Demo video (≤2 min):** phone A sends $20 → phone B gets the push within ~1 s (webhook) → show the webhook in the Alchemy dashboard and the request log → app reads through Alchemy RPC (network tab) on testnet and mainnet.

---

## 4. Envio

- **HyperSync:** the full activity history, notifications and receipts come from every Kin contract plus AUSD transfers in one paged query (~2.5 s for the whole chain history). Real-money mode uses HyperSync on Monad mainnet (`143.hypersync.xyz`) per person. Code: `app/src/lib/server/history.ts`.
- **HyperIndex:** `indexer/` indexes every event of the Kin contracts the activity feed reads (names, escrow, streams, pots, circles, AutoPay, gift links) plus Kin-related AUSD transfers into typed `Account`/`Activity` entities (GraphQL), plus cash-outs. **The Activity feed is served from it:** `/api/activity` asks HyperIndex for one person's newest payments with the other side's @name joined (code: `indexedTransfers` in `app/src/lib/server/history.ts`), so the app skips downloading history and looking up each name; a live tail covers blocks the indexer hasn't reached, and HyperSync is the fallback.

---

---

## 5. Aurora — Bring Any-Chain Liquidity to Monad

**Add money from another account** (Money → Add money, real-money mode, Monad mainnet):
1. Kin asks Aurora's Swap API (`/api/quote`) for a one-time deposit address: USDC/USDT/ETH on Base, Arbitrum, Ethereum, Optimism, Polygon or USDC on Solana → **USDC on Monad**, recipient = the user's own Kin address, refund to the same address.
2. The user (or family abroad) sends from any wallet or exchange; Kin polls `/api/status` and shows plain steps (waiting → on its way → arrived).
3. On arrival, one gasless signature converts USDC → AUSD through **KinAddMoney** (`0xdF70AaC88E464c78cDe367B5d2879776C2994102`, mainnet): EIP-3009 USDC pull whose nonce commits to recipient + minimum out, Uniswap v4 AUSD/USDC pool, nothing held.
- Onchain evidence (mainnet): 4.997 USDC → 4.998 AUSD (tx `0xeb5c63207d152985775706c6b9957997b8c238bd40d4883c351b43c1b891a8d0`) and 0.999 USDC → 0.999 AUSD (tx `0xbd826a1e424aafca5ef8f22561ca014c8b4d72f91dda7898f42a2cc1a4d2004a`), both submitted by Kin's relayer.
- Code: `app/src/app/api/addmoney/route.ts`, `app/src/app/add/page.tsx`, `app/src/lib/offramp.ts` (`convertToDollars`), `contracts/src/KinAddMoney.sol` (+ mainnet fork test).
- Limit: Aurora persistent deposit addresses are not enabled for our key yet (403), so each top-up uses a one-time address valid for 1 hour.

---

## 6. Chainlink — Best workflow with CRE

**Kin Orchestrator** (`cre/kin-orchestrator/main.ts`): every 10 minutes the workflow
1. fetches USD → local FX rates (₹, AED, PHP, MXN, NGN, GBP, EUR) from 3 public APIs, median per currency, then consensus across nodes;
2. finds Kin money jobs that are due (AutoPay collects, dated gift links, savings-circle rounds, escrow releases) by dry-running each candidate through Multicall3;
3. writes one signed report to **KinKeeper** (`0x6096983BDD0101B82384CC6368F27C08e91e4212`, Monad testnet), which stores the rates and runs the jobs (try/catch per job, event per job).
- The app reads the rates from KinKeeper (`/api/rates`) and falls back to its fixed table when they are older than a day.
- Run with `cre workflow simulate --broadcast` (real Monad testnet txs through the mock forwarder `0xB9F7…d192`); not deployed to a live DON. Last rate update onchain: 2026-10-12 01:38 UTC.
- Q&A note: KinKeeper trusts its forwarder; every job it runs is one the contracts already allow anyone to trigger once due, so a bad report can't move money anywhere new. Rates may move at most 15% per report onchain, and the app ignores any rate more than 8% off its own table.

### Honest limits (say them if asked)
- The rupee payout is a labeled practice step: dollars really settle through Agora's Instant Settlement on testnet, but no INR moves. Real payout = bridge + licensed INR partner (post-hackathon).
- On mainnet, programs (pots, circles, streams) stay on practice money for now; only send, receive, add money and activity use real money. Real cash-out is "Coming soon".
- A relayer pays gas: per-IP and per-account limits apply; sybil hardening (attestation) is planned.

### Security review (two independent audits, Oct 5)
No Critical findings. Fixed and redeployed: cash-out output now goes to a user-signed recipient (nothing held in the contract); pot invite links admit one person and can't be chained (blocks sybil-filling a shared pot); relay de-duplicates by forwarder nonce, rejects mainnet dust, rate limits fail closed; UPI payout reference is salted. Known, deferred to the mainnet versions:
- Push-style payouts (circles, pots, streams) revert if Agora freezes one recipient → move to pull payments.
- `@handle` claims can be front-run → commit-reveal.
- Circle members rely on the relayer to submit `pay` before the round ends → grace window / self-submit fallback.
- Escrow `autoApproveAt < expiresAt` and gift-link `bind` expiry checks; recipient sanity checks in Stream/GiftLink.
