# Kin — early user tests

**Status: DRAFT.** Everything in the "Verified on-chain" column is checkable and was read from the chain on 2026-10-04.
Cells marked `TODO(founder)` are things only the testers/founder know (role, device, how it went, quote) — they are
left blank on purpose rather than guessed. Fill them before submitting.

## Summary
- **6 people besides the founder** created a Kin account on their own and used it between **2026-09-30 and 2026-10-04**
  (founder-confirmed; each one claimed a @name on-chain).
- **5 of the 6 went beyond signing up** and used a feature: held payments, savings circles, family pots, AutoPay.
- Features exercised by these testers (on-chain): savings circle (3 people created or joined one), held/escrowed payment (3),
  family pot (1 person, 3 pots), AutoPay (1), receiving a released payment (1).
- Several flows were run together with the founder's own account (e.g. circle members, a held payment sent to a tester) —
  so this is early, friendly testing, not independent traffic. 19 other named accounts in the system are our own automated test
  accounts and are **not** counted here.

## Method
Note: these first tests ran on the original host (kin-money.vercel.app). Passkeys are tied to the site address, so the production site later moved to getkin.space; accounts made on the old host come over through its `/move` page. The on-chain evidence below is unaffected.

Kin now lives at `https://getkin.space` (web) and the Android APK (same account); new tests run there.

`TODO(founder)`: how the tests were run (in person / remote), whether anyone helped, which link or app they used (web PWA
on `kin-money.vercel.app` at the time, and/or the Android APK), and what each person was asked to try.

## Testers
Roles are anonymised here; first names and handles are kept in private notes and can be shared with judges on request.

| # | Role / segment | Device + browser | First activity | Verified on-chain | Finished first send unaided (Y/N, where stuck) | Quote (verbatim, with permission) |
|---|---|---|---|---|---|---|
| 1 | `TODO(founder)` | `TODO(founder)` | Sep 30 | Claimed a name; created a held payment; created a savings circle; joined a savings circle (7 transactions, through Oct 3) | `TODO(founder)` | `TODO(founder)` |
| 2 | `TODO(founder)` | `TODO(founder)` | Oct 1 | Claimed a name; created 2 held payments; created a savings circle (5 transactions, through Oct 3) | `TODO(founder)` | `TODO(founder)` |
| 3 | `TODO(founder)` | `TODO(founder)` | Oct 1 | Claimed a name; received a released held payment; made 1 payment (4 transactions) | `TODO(founder)` | `TODO(founder)` |
| 4 | `TODO(founder)` | `TODO(founder)` | Oct 1 | Claimed a name; created a savings circle (3 transactions, through Oct 3) | `TODO(founder)` | `TODO(founder)` |
| 5 | `TODO(founder)` | `TODO(founder)` | Oct 2 | Claimed a name; created 3 family pots; made 2 contributions; created an AutoPay that was collected once (10 transactions, through Oct 4) | `TODO(founder)` | `TODO(founder)` |
| 6 | `TODO(founder)` | `TODO(founder)` | Oct 3 | Claimed a name (no other activity yet) | `TODO(founder)` | `TODO(founder)` |

## What we learned
`TODO(founder)`: 3–5 plain findings from watching these people (where they hesitated, what they liked, what broke), and
what we changed because of it. Write only what you actually observed.

## How to verify
Every "Verified on-chain" cell comes from public contract events on Monad testnet (KinNames, KinEscrow, KinCircle, KinPot,
KinMandate) and is indexed in our Envio indexer (`indexer/`). Contract addresses: `contracts/deployments/10143.json`.

## Next round
Five recorded sessions on `https://getkin.space` with a fixed protocol (testers above first move their account over at
`https://kin-money.vercel.app/move`, so each is a ~5-minute call): first-run signup time, first send, first cash-out to UPI,
first pot/circle, what confused them, would they invite family. Results will be added here.
