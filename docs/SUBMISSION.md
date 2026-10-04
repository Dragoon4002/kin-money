# Submission Checklist — Monad Metropolis, Consumer Products & Payments

Deadline: **2026-10-14 09:29 IST**.

## Deliverables
- [ ] Logo — JPG/PNG/WEBP, ≤3MB
- [ ] Public GitHub repo, accessible to `metropolis@hackathon.monad.xyz`
- [ ] Technical demo video — ≤3 min, YouTube/Loom/Vimeo, **live product only** (no slides/code)
- [ ] Pitch video — ≤2 min: team, problem, why us
- [ ] Live product link — Monad testnet/mainnet, access instructions + test credentials for judges
- [ ] (Optional) 30s ad clip

## Bounty-specific proof
- [ ] **Agora:** AUSD sent cross-border end-to-end in demo; Mera passkey onboarding shown; settlement time visible.
- [ ] **Mera UX:** zero seed phrase / extension / custody backend anywhere. Show signup on a fresh phone.

## Judge access notes (fill before submit)
- **URL:** https://kin-money.vercel.app (only this hostname — passkeys are tied to it; a preview URL = a different account).
- **Devices:** Android Chrome with a screen lock set · iPhone iOS 18+ Safari · desktop Chrome with a synced passkey (Google Password Manager / iCloud Keychain).
- **Credentials:** none shared, by design. Passkeys can't be shared, so each judge creates their own account in ~20s — no email, no password, no recovery phrase, no extension.
- **Test funds:** new accounts automatically receive **$10,000 in test dollars** (Agora testnet faucet, sent by our relay; skipped if the account already holds $100+).
- **Someone to pay:** send to **`@sounak`** (the founder's own account; test dollars, no value), or pair with another judge / a second device. Payments to it are visible on its Activity tab and on the explorer.
- **Android APK:** `TODO(paste latest APK link)` — same passkey, same account as the web app.
- **Contact:** Sounak Dey · sounak.dey4200@gmail.com · Telegram @Dragoon_Sounak · X @DragoonSd4

### 3-minute tour (in order)
| # | Tap | You should see | Proof |
|---|---|---|---|
| 1 | Open the URL → **Create my account** → enter first name → **Create with Identity check** → fingerprint/face/PIN | Home with your balance; test dollars arrive within seconds | No recovery phrase or extension was ever asked for (Mera bounty) |
| 2 | Home → **Send** → **To a person** → `@name` → amount → **Send now** → Identity check | Receipt screen with **Delivered in X.Xs ✓✓** | Same screen → **Proof of payment** → **Verify on the public explorer ↗** (Agora bounty: digital-dollar transfer, settle time shown) |
| 3 | Home → **Send** → **As a link** → amount → create | "Your link is ready", held safely for 7 days | Open the link in another browser: **Create free account to collect** |
| 4 | Explore → **Savings jars** → **New jar** → name + goal → **Start saving** → **Add to jar** the full goal | Jar fills and the money lands back in your balance by itself | Activity tab → tap the entry → Proof of payment |
| 5 | Explore → **Live allowance** → pick `@name` → amount + period → confirm | Allowance screen where the amount grows every second | Recipient can withdraw; Activity → Proof of payment |
| 6 | Explore → **Family pot** or **Circles** → create → share invite link | Invite link others can open to join | Pot pays out by itself at the goal |
| 7 | Explore → **Pay a bill** or **Chores** | Money only payable to the named payee / released after parent OKs | Activity → Proof of payment |
| 8 | Me → **Invite & earn** | Your invite link + **Invite on WhatsApp**; your Kinko unlocks a party hat after you invite someone, and your friend's does when they join | People who joined show up in the list |

Every payment's proof: **Activity tab → tap the payment → Details → Proof of payment → Verify on the public explorer ↗.**

### Known limits (stated honestly)
- Monad **testnet** only; test dollars have no value.
- **Cash out to bank** (Money tab) is a mock screen — no real bank payout.
- Local-currency amounts use a fixed demo exchange table, not live rates; "saved vs bank wire" is an **estimate** (3% + $5), not a measured fee.
- Abuse limits on our relay: 600 payments/h per IP, 200/day per account; test dollars 100/day per IP, 2/week per account. On a shared venue network many signups from one IP can briefly see "slow down" — wait a minute or switch to mobile data.
- A full savings-circle rotation takes several rounds; one round is enough to see the rules.
- Signing up from an invite/gift link lands on Home — reopen the link to finish.

## Traction evidence
- [ ] 5+ user tests (names/roles, device, completed flow Y/N, quote) — draft with the verified on-chain facts in `docs/user-tests/README.md`; still needs roles, devices, outcomes and quotes
- [ ] Distribution plan: next 100 users — which groups, which channel
