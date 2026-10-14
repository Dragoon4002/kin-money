# Submission Checklist — Monad Metropolis, Consumer Products & Payments

Deadline: **2026-10-14 09:29 IST** (official) — treat **2026-10-13 EOD IST** as the hard stop.

## Still blocking submission (founder)
- [ ] Repo **public** + `metropolis@hackathon.monad.xyz` given access (repo is private as of Oct 13)
- [ ] Demo video link · pitch video link (not recorded as of Oct 13)
- [ ] Final APK hosted somewhere stable (EAS links expire after 14 days) → paste below + README
- [ ] Fill the 9 `TODO(founder)` cells in `docs/user-tests/README.md` (only what you observed)
- [ ] Optional: verify mainnet KinCashoutV2 source (`docs/ARCHITECTURE.md` → Mainnet runbook) — until then, don't call it verified

## Deliverables
- [ ] Logo — JPG/PNG/WEBP, ≤3MB
- [ ] Public GitHub repo, accessible to `metropolis@hackathon.monad.xyz`
- [ ] Technical demo video — ≤3 min, YouTube/Loom/Vimeo, **live product only** (no slides/code)
- [ ] Pitch video — ≤2 min: team, problem, why us
- [ ] Live product link — Monad testnet/mainnet, access instructions + test credentials for judges
- [ ] (Optional) 30s ad clip

## Bounty-specific proof
- [ ] **Agora:** AUSD sent cross-border end-to-end in demo; Mera passkey onboarding shown; settlement time visible; practice cash-out through Instant Settlement.
- [ ] **Aurora:** add money from another chain on mainnet (real USDC → AUSD; evidence txs in `docs/BOUNTIES.md` §5).
- [ ] **Chainlink CRE:** `cre workflow simulate --broadcast` run on camera → KinKeeper tx on testnet (re-run before recording so live rates show again).
- [ ] **Mera UX:** zero seed phrase / extension / custody backend anywhere. Show signup on a fresh phone.

## Judge access notes (fill before submit)
- **URL:** https://getkin.space (only this hostname — passkeys are tied to it; a preview URL = a different account). Accounts made on the old address `kin-money.vercel.app` (before Oct 6) move over at https://kin-money.vercel.app/move.
- **Devices:** Android Chrome with a screen lock set · iPhone iOS 18+ Safari · desktop Chrome with a synced passkey (Google Password Manager / iCloud Keychain).
- **Credentials:** none shared, by design. Passkeys can't be shared, so each judge creates their own account in ~20s — no email, no password, no recovery phrase, no extension.
- **Test funds:** new accounts automatically receive **$10,000 in test dollars** (Agora testnet faucet, sent by our relay; skipped if the account already holds $100+).
- **Someone to pay:** send to **`@sounak`** (the founder's own account; test dollars, no value), or pair with another judge / a second device. Payments to it are visible on its Activity tab and on the explorer.
- **Android APK:** `TODO(founder): paste final, stable APK link` — same passkey, same account as the web app.
- **Contact:** Sounak Dey · sounak.dey4200@gmail.com · Telegram @Dragoon_Sounak · X @DragoonSd4

### 3-minute tour (in order)
| # | Tap | You should see | Proof |
|---|---|---|---|
| 1 | Open the URL → **Create my account** → enter first name → **Create with Identity check** → fingerprint/face/PIN | Home with your balance; test dollars arrive within seconds | No recovery phrase or extension was ever asked for (Mera bounty) |
| 2 | Home → **Send** → **To a person** → `@name` → amount → **Send now** → Identity check | Receipt screen with **Delivered in X.Xs ✓✓** | Same screen → **Proof of payment** → **Verify on the public explorer ↗** (Agora bounty: digital-dollar transfer, settle time shown) |
| 3 | Money tab → **Cash out to UPI** → amount → check the route (AUSD → USDC → INR) and the bill → **Cash out ₹X** → Identity check | Steps: price locked at Agora's fixed price → dollars settled in about a second → rupees quote; then "₹X on its way" labelled **Practice cash-out** | **Proof of payment** on the same screen: dollars really settle through Agora Instant Settlement on testnet (KinCashoutV2 `0xca36…ad37`); the rupee payout is a labelled practice step |
| 4 | Me → **Money** → **Real money** switch on | Money tab chip says **Real money**; balance, send, receive and activity use real dollars (Monad mainnet AUSD), same account; **Money → Add money** gives a one-time deposit address (Aurora Intents) — send USDC/USDT/ETH from Base, Arbitrum, Ethereum, Optimism, Polygon or Solana and it arrives as dollars | Explore shows "These use practice money for now"; Cash out shows "Coming soon". No real dollars are given — switch back off to continue |
| 5 | Home → **Send** → **As a link** → amount → create | "Your link is ready", held safely for 7 days | Open the link in another browser: **Create free account to collect** |
| 6 | Explore → **Savings jars** → **New jar** → name + goal → **Start saving** → **Add to jar** the full goal | Jar fills and the money lands back in your balance by itself | Activity tab → tap the entry → Proof of payment |
| 7 | Explore → **Live allowance** → pick `@name` → amount + period → confirm | Allowance screen where the amount grows every second | Recipient can withdraw; Activity → Proof of payment |
| 8 | Explore → **Family pot** or **Circles** → create → share invite link | Invite link others can open to join (pot links admit one person; a second join sees "already used") | Pot pays out by itself at the goal |
| 9 | Explore → **Pay a bill** or **Chores** | Money only payable to the named payee / released after parent OKs | Activity → Proof of payment |
| 10 | Me → **Invite & earn** | Your link (`/invite?u=yourname`) + **Invite on WhatsApp**; counts of friends who joined and who made a payment, a progress bar to the next collectable; a friend who joins sees "You joined with @you — save as friend?" | People who joined show up in the list with their payment status; collectable scenes unlock as friends make a payment ("What's up, friend" handshake, "Gang's here" crew); money rewards are announced as coming soon |

Every payment's proof: **Activity tab → tap the payment → Details → Proof of payment → Verify on the public explorer ↗.**

### Known limits (stated honestly)
- Practice mode runs on Monad **testnet**; test dollars have no value. **Real money** mode (Monad mainnet AUSD) covers balance, send, receive, add money from other chains (Aurora Intents), activity and proof only — jars, pots, circles, allowances, links and cash-out stay on practice money.
- **Cash out:** the dollars really settle on testnet through Agora's Instant Settlement pair (KinCashoutV2 `0xca36cE5954E4C4058216b19622106525A894ad37`; the first version, KinCashout `0xDdBc…b75a`, still shows past cash-outs), but no rupees move — the payout is a labelled practice step. A real-money cash-out has **not** been tested end to end. Planned path: LayerZero bridge → licensed INR payout partner, or Agora's mainnet pair; we are in onboarding with Agora (Via endpoint offered). The ₹ amount is an Onramp sandbox quote (Kin's own estimate if that's unavailable).
- Local-currency amounts use rates the Chainlink CRE workflow writes to KinKeeper, and fall back to a fixed table when those are over a day old (the workflow runs by simulation, not on a live DON; last onchain update Oct 12 → today the fixed table is in use); "saved vs bank wire" is an **estimate** (3% + $5), not a measured fee.
- Abuse limits on our relay: 600 payments/h per IP, 200/day per account; test dollars 100/day per IP, 2/week per account. On a shared venue network many signups from one IP can briefly see "slow down" — wait a minute or switch to mobile data.
- A full savings-circle rotation takes several rounds; one round is enough to see the rules.
- Signing up from an invite/gift link lands on Home — reopen the link to finish.

## Traction evidence
- [ ] 5+ user tests (names/roles, device, completed flow Y/N, quote) — draft with the verified on-chain facts in `docs/user-tests/README.md`; still needs roles, devices, outcomes and quotes
- [ ] Distribution plan: next 100 users — which groups, which channel (draft: `tasks/100-users-plan.md`; tasks/ is private — copy what you want judges to see into the form)
