# Kin — Bounty write-ups (paste into the submission form)

Live: https://getkin.space · Android APK: see README · Network: Monad testnet (10143), real-money mode on Monad mainnet (143).
Contracts (testnet, verified): KinForwarder `0xdF70…4102` · KinNames `0x1cA3…8476` · KinEscrow `0x2F2e…a55e` · KinStream `0xaF98…41DB` · KinPot `0x35E3…2A78` · KinCircle `0x0b46…9B41` · KinMandate `0xe770…fd53` · KinGiftLink `0x7ad1…6BDb` · **KinCashout `0xDdBc1208e84E82676bfc7452F25cecDB3B05b75a`**.

---

## 1. Agora — Best Cross-Border Payments App on Monad

**Describe the core features of your app with a focus on how it enables a user to send AUSD to another person or across borders.**

Kin is a mobile money app for one person: someone in India whose family is abroad (a parent funding a student, a worker sending home). AUSD is the only money in the app. Users see it as dollars and in their own currency, and never see a wallet, gas or a chain.

- **Onboarding in one step:** a Mera passkey (fingerprint or face) creates the account. There's no seed phrase, no extension and no email, and the same account works on web and Android.
- **AUSD balance:** shown in local currency (₹, $, AED…), with practice AUSD from Agora's testnet faucet on signup.
- **Send across borders:** by `@name`, by scanning a QR, or by WhatsApp link to someone not on Kin yet (refundable after 7 days). The user signs an **EIP-3009 `transferWithAuthorization`** on AUSD with their passkey. Our relayer submits it and pays the gas, so the user holds no MON and sends are free. Settlement is instant (~1 s on Monad), with a "Delivered ✓✓" receipt and proof link.
- **Receive:** a personal QR (EIP-681), so other wallets can pay AUSD too. Incoming money pushes "You got $X from @name" instantly (Alchemy webhook).
- **Cash out to UPI via Agora Instant Settlement:**
  1. The user enters an amount and a UPI ID and sees a live quote: Agora's fixed price, then ₹ after the payout fee and 1% TDS.
  2. One identity check signs a gasless call to our **KinCashout** contract.
  3. KinCashout pulls the AUSD (`receiveWithAuthorization`) and **swaps it at Agora's fixed price on the Instant Settlement pair** on Monad testnet (AUSD/CTK `0x1Aa8…b0ae`, whitelisted via Agora's Whitelister).
  4. It emits `CashedOut(user, ausdIn, settledOut, payoutRef)`. The UPI ID is stored only as a hash.
  5. The rupee payout is labeled as practice, as the bounty asks ("mock movements of funds using the Instant Settlement contract on Monad testnet").
- **Real money mode:** a switch in Settings moves balance, send, receive, activity and proof to **Monad mainnet AUSD**. The same passkey gives the same address, and the same gasless EIP-3009 send is used. The production cash-out path is: **LayerZero (OFT) bridge Monad → Ethereum (or a cheaper chain)** → INR payout partner (Agora's CEO, Nick van Eck, advised this route), or Agora's mainnet AUSD/USDC Instant Settlement pair → an INR off-ramp.
- **Beyond one-off sends:** money that behaves: per-second allowance streams with emergency unlock, savings circles, family pots, bills payable only to a named payee, and invoices with milestones. All of it settles in AUSD on our own contracts.

**Why it can break out:** India is the world's largest remittance market. Kin is free and instant, needs no app store or KYC to start, and every send recruits the receiver.

**Demo video (≤2 min):** passkey signup → AUSD balance → send to `@name`, delivered in ~1 s → receiver's "You got $X" → cash out to UPI through Agora Instant Settlement → proof on the explorer.

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

1. **Node API (Monad testnet + mainnet), on web and Android.** Alchemy's Monad endpoint is first in Kin's RPC chain for every balance read, receipt wait, gas estimate and relayer submission. Public RPCs stay as fallback. Before this, public-RPC 429s broke pages under load. The same key serves both networks, so Kin's real-money mode (mainnet) and practice mode (testnet) share one provider. Code: `app/src/lib/chain.ts`, `mobile/src/lib/config.ts`.
2. **Custom Webhooks (GraphQL) → instant payment notifications.** One webhook on Monad testnet streams every AUSD `Transfer` log (filtered by contract + topic in GraphQL) the moment its block lands. `/api/alchemy/webhook` verifies `X-Alchemy-Signature` (HMAC-SHA256), turns the logs into our history records, and pushes "You got $X from @name" to the receiver's phone and web. It shares the "first to index a log notifies" store with our scanner, so each payment notifies **exactly once**. This replaced polling for the money-received moment, the most emotional moment in a remittance app. Code: `app/src/app/api/alchemy/webhook/route.ts`, `app/src/lib/server/history.ts`.

**Demo video (≤2 min):** phone A sends $20 → phone B gets the push within ~1 s (webhook) → show the webhook in the Alchemy dashboard and the request log → app reads through Alchemy RPC (network tab) on testnet and mainnet.

---

## 4. Envio

- **HyperSync:** the full activity history, notifications and receipts come from every Kin contract plus AUSD transfers in one paged query (~2.5 s for the whole chain history). Real-money mode uses HyperSync on Monad mainnet (`143.hypersync.xyz`) per person. Code: `app/src/lib/server/history.ts`.
- **HyperIndex:** `indexer/` indexes every Kin event plus Kin-related AUSD transfers into typed `Account`/`Activity` entities (GraphQL). The app prefers it when `ENVIO_GRAPHQL_URL` is set.

---

### Honest limits (say them if asked)
- The rupee payout is a labeled practice step: dollars really settle through Agora's Instant Settlement on testnet, but no INR moves. Real payout = bridge + licensed INR partner (post-hackathon).
- On mainnet, programs (pots, circles, streams) stay on practice money for now; only send, receive and activity use real money.
- A relayer pays gas: per-IP and per-account limits apply; sybil hardening (attestation) is planned.

### Security review (two independent audits, Oct 5)
No Critical findings. Fixed and redeployed: cash-out output now goes to a user-signed recipient (nothing held in the contract); pot invite links admit one person and can't be chained (blocks sybil-filling a shared pot); relay de-duplicates by forwarder nonce, rejects mainnet dust, rate limits fail closed; UPI payout reference is salted. Known, deferred to the mainnet versions:
- Push-style payouts (circles, pots, streams) revert if Agora freezes one recipient → move to pull payments.
- `@handle` claims can be front-run → commit-reveal.
- Circle members rely on the relayer to submit `pay` before the round ends → grace window / self-submit fallback.
- Escrow `autoApproveAt < expiresAt` and gift-link `bind` expiry checks; recipient sanity checks in Stream/GiftLink.
