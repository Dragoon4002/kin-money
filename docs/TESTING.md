# Kin — Step-by-step feature test guide

Live: https://kin-money.vercel.app (features marked 🌿 are on branch `feature/remaining` until merged).
Every money action ends with a receipt → **Details → Proof of payment** (explorer link) to verify onchain.

## 0. Setup (once)
- **Two accounts:** A = "parent/sender", B = "kid/receiver". Use two phones, or phone + desktop Chrome **signed into a different Google account** (passkeys sync per Google account).
- Android: Chrome + Google Password Manager. iPhone: Safari, iOS 18+.
- On each: open the site → **Create my account** → first name → Face ID → pick `@handle` → wait for **$10,000 welcome money**. Both now show in each other's `@name` autocomplete.
- Tip: Me → Currency to try ₹/$; Me → Appearance for light/dark.

## 1. Account
| Test | Steps | Expect |
|---|---|---|
| Sign-up | Above | Balance $10,000 on Money; `@handle` on Me |
| Lock/unlock | Me → Lock now → Face ID on any action | Unlocks, same account |
| New device | Other browser/phone with same Google account → "I already have Kin" | Same `@handle` + balance |

## 2. Send & receive
| Test | Steps | Expect |
|---|---|---|
| Send by name | A: Home → type 50 → **Send** → type `@b` (autocomplete) → note + category → Send now | "Delivered ✓✓ in ~1s"; B's balance +50; receipt with category |
| Send as link | A: Pay → **As a link** → 20 → share | B (or a new user) opens link → collects → "is yours"; A can **Take back** after 7 days if unclaimed |
| Request (person) | B: Home → 30 → **Request** → From a person → `@a` | A: Activity → Requests → **Pay** → B +30 |
| Request (link/QR) | B: Request → **As a link** → 25 + note | A opens link/scans QR → Pay prefilled → Send now |
| My QR + amount | B: Me → My QR → amount 15 | QR caption "Scan to pay 15"; A scans → prefilled |
| Scan | A: Home → scan icon → point at B's QR (or "Scan from a photo") | Opens Pay prefilled; a UPI/other QR says "not a Kin code" |

## 3. Programmable money
| Feature | Steps (A = parent, B = kid) | Expect |
|---|---|---|
| **Live allowance** | A: Explore/Money → Live allowance → pick `@b`, amount 70, **1 week** → Start | B: allowance screen ticks up every second → **Collect** moves earned part to balance. A: **Stop** → "they keep X, you get Y back" |
| **Emergency fund** | A: on the allowance, set an emergency fund (e.g. 100) | B taps **Emergency** ("Mum has been asked") → A sees the ask → **OK it — send now** (Face ID) → B +100 instantly |
| **Savings jar** | A: Money → Savings jars → name + icon + goal 50 → Create → **Add money** 20, then 30 | Ring fills 40% → 100%; at goal: confetti + Kinko celebration, money returns to balance |
| **Family pot** | A: Family pot → beneficiary `@b`, monthly target 100, members `@a` (+ others) → Start → **Chip in** 60, then 40 | Progress shows per member; at 100 the pot **auto-pays @b** and starts the next round |
| **Savings circle** | A: Circles → members in payout order `@a`, `@b` (+more), contribution 10, round **5 minutes** → Create. Each member opens it → **Join** (safety deposit: earlier turns deposit more) | When all join it starts; each round everyone **Pay this round**; when all paid (or 5 min passes) anyone taps **Settle** → whose-turn member gets the pot. Skip paying once to see "Missed a round" + deposit covering it |
| **Chores** | A: Chores → kid `@b`, "Dishes", reward 2 → Post → **Tell @b** (share link) | B opens link → chore appears → **I did it!** → A sees it under "Check" → **Looks good — pay** → B +2, listed in paid chores |
| **Pay a bill** | A: Pay a bill → payee `@school` (any account), approver `@b`, amount 40 | Money held; B sees it → **Bill looks right — pay it** → payee +40. Unpaid by the date → returns to A |
| **Invoice** | B (freelancer): Invoice → client `@a`, title, milestones 30/20, auto-release 3 days → share link | A opens link → confirms each milestone (money held) → **Work looks good — pay** releases to B; untouched milestones release automatically after the days pass |
| **Gift** | A: Gift → `@b`, 25, unlock date (tomorrow or a few minutes ahead), optional guardian | B sees a locked gift card with countdown → after the date **Open** → +25 |
| **Gift link** (new user) | A: Gift → **As a gift link** → 25, message, opening date (or "In 2 min") → share | Friend (not on Kin) opens link → wrapped gift card → creates account + @name → "This gift is yours, @name · opens in …" → on the date **Open** (or daily job) → +25. Link no longer works for anyone else; A sees "Accepted by @name". Automated: `scripts/e2e-giftlink.mts` |
| **AutoPay** 🌿 | A: Explore → AutoPay → payee `@b`, 10, **Demo: 5 min**, 3 times → Set up | After 5 min: B (or the daily job) **Collect** → +10 per due payment; A **Stop** → due ones paid, rest refunded |
| **Trips (group splitter)** 🌿 | A: Explore → Trips → New trip "Goa" → add `@b`, `@c` (all on Kin). Add expenses: A paid 90 "Hotel" split A,B,C; C paid 30 "Taxi" split B,C | **Balances**: A +60, B −45, C −15. **Settle up**: "B pays A 45", "C pays A 15". B taps **Pay all I owe** (one Face ID) → paid onchain → row ✓; B's balance 0. Automated: `node --experimental-strip-types --env-file=.env.local scripts/e2e-trip.mts` |
| **AutoPay (automated)** 🌿 | `node --experimental-strip-types --env-file=.env.local scripts/e2e-autopay.mts` against a running server (~2 min) | create → 2 due after 65s → cron collects → payee can't stop → payer stops → refund, money conserved |
| **Split a bill** | A: Split → pick `@b` (+others), total 90, Even or **Custom** 🌿 | Each gets a request; custom blocks until parts add up |

## 4. People & identity
| Test | Steps | Expect |
|---|---|---|
| Autocomplete | Any `@name` field → type 2 letters | Up to 5 suggestions with Kinko avatars |
| Contacts | People → + Add → `@b`, label "Mum" (or phone 🌿) | Shows in Your people; recents/suggestions fill after payments |
| Kinko | Me → Customize Kinko → change skin/face; locked items show how to unlock | Your avatar updates everywhere; others see it after reload |
| Unlocks | Collect an allowance / fill a jar / pay a circle on time / get a chore paid | Headphones / crown / cap / bow unlock; Kin Score rises |
| Invite | Me → Invite & earn → share | Friend opens `/?ref=` → both get the party hat |

## 5. Tracking & settings
| Test | Steps | Expect |
|---|---|---|
| Activity | Activity tab | Moments cards + list; tap → receipt; Proof of payment → explorer |
| Spends | Activity → chart icon | Month total, line chart, category bars |
| Private mode 🌿 | Me → Hide amounts | Balances show •••• (tap to peek) |
| Cash-out 🌿 | Money → Cash out to bank | Mock flow, "coming soon", no money moves; "saved vs bank wire" chip |
| Swipe nav | Swipe left/right on tabs | Money ⇄ Explore ⇄ Home ⇄ People ⇄ Activity; nav stays put |
| Install | Android Chrome / iPhone Safari on Home | "Add Kin to your home screen" banner |

## 6. Android app
1. Install APK (Expo build page) → allow unknown apps.
2. Dev build: on the laptop `cd mobile && npx expo start --tunnel`, open Kin on the phone, connect.
3. **I already have Kin** → pick your Google passkey → same `@handle` + balance as web.
4. Send, Scan, My QR, Activity natively; More → features open in Chrome tabs (same account).

## 7. Judge quick path (5 min)
Create account → send 50 to `@sounak` → open My QR, scan from another phone → start a 1-week allowance and watch it tick → post a chore and pay it → open receipt → Proof of payment.
