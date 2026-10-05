# Kin — Go-to-market

Status: hackathon build on Monad **testnet**. Everything below about launch is a plan, not traction.
Numbers marked `[verify before citing]` are external and must be re-checked against the named source. `TODO(real data)` = we don't have it yet.

## 1. Problem and who feels it
Families split across countries already send money. What they can't do is make that money *behave*.

| Who | The pain, in plain words |
|---|---|
| Workers abroad paying family | Every send is a manual job. Fees and slow transfers eat small, frequent amounts. No say in what it's spent on. |
| Parents of students abroad | Send a lump sum, then worry. No way to drip it, earmark it for rent/fees, or release it fast in an emergency. |
| Savings circles (susu, tanda, chit) | Run on trust and a notebook. Someone collects late, someone skips a turn, nobody can enforce it. |
| Freelancers paid from abroad | Wait days for a client wire, lose a cut to fees, chase payment for each milestone. |

User quotes: `TODO(real data)` — no interviews recorded yet.

## 2. Wedge: send → cash out to UPI for one Indian family, then money that behaves
Core loop (per Agora mentor advice, Oct 5): a family member abroad sends dollars by @name, QR or link (~1s, no fee to the user), and the person in India cashes out to their UPI ID — dollars settle through Agora's Instant Settlement on Monad testnet; the rupee payout is a labelled practice step until a licensed INR partner is live. Plain sending is taken in-track (Homeward — link sends, standing orders; TakumiPay — merchant QR), so the differentiator is money that follows rules — each one a live contract on Monad testnet:

| Kin feature | What banks/remittance apps don't do |
|---|---|
| Live allowance | Pocket money grows every second; emergency unlock on one tap |
| Pay a bill | Money can only go to the school / landlord / doctor |
| Family pot, savings jars | Siblings chip in; pays out by itself at the goal |
| Savings circles | Rotation + safety deposits enforced, not trusted |
| Chores | Parent funds, kid marks done, parent OKs, money moves |
| Dated gifts | Opens itself on the day |
| Invoices | Named parts, due dates, mark done |

Pitch line: *Other apps move money like a message. Kin makes money that behaves.*

## 3. Beachhead: one corridor, one community
The team is India-based. India is the largest remittance-receiving country (World Bank Migration & Development Brief) `[verify before citing]`.

| Option | Pro | Con |
|---|---|---|
| Gulf (UAE) → India | Largest volume; circles (chit funds) culturally familiar | Plain "send home" use case = where competitors are strongest; senders hardest for us to reach this month |
| UK/US → India (workers) | High smartphone use | Same "send home" framing; crowded with fintechs |
| **Indian students abroad (UK) + their parents** | Uses the *programmable* features (allowance, pay a bill, emergency unlock, trips, split) — our wedge; students are reachable via campus associations; peer use (split, trips) works abroad before any cash-out exists | Parent's money leaves India under outward-remittance rules — the hardest regulatory leg (see §7) |

**Recommendation: Indian students in the UK + their families in India.** Start peer-to-peer among students (split, trips, pots, circles), then bring parents in via allowance and pay a bill. Gulf→India is the expansion corridor once a licensed partner exists.

Assumptions to check: (a) the team can reach UK-based Indian students through its own network — `TODO(real data)`; (b) students will hold a dollar balance rather than pounds/rupees — untested; (c) a licensed partner can cover the India→UK funding leg — unknown.

## 4. Channels (ranked by cost/effort, lowest first)
| # | Channel | What in the product does the work |
|---|---|---|
| 1 | WhatsApp family/friend groups | Pot and circle invite links → open → join; claim links let non-users collect money (refundable after 7 days); gift links |
| 2 | Referral loop | Invite & earn: invite link, "Invite on WhatsApp" button; the inviter's Kinko unlocks a party hat after they invite someone, and the friend's unlocks when they join from the link |
| 3 | University Indian student associations (UK) | One circle or trip per group seeds many accounts at once |
| 4 | Diaspora community orgs (cultural/religious groups running savings circles) | Circles with safety deposits replace the notebook |
| 5 | Creator / community partnerships (student-life, finance-for-diaspora creators) | Share-card receipts and Kinko as visual hooks; costs money/time — last |

## 5. Business model (hypotheses — none tested)
| Hypothesis | Note |
|---|---|
| Sending between Kin accounts stays free, no spread | Core promise; relayer cost per payment on mainnet `TODO(real data)` |
| Fee or FX spread on cash-out to local bank | Set by/with the licensed partner |
| Share of yield on money sitting in pots/jars | Needs a compliant yield source; not built |
| Premium Kinko outfits | Small; tests willingness to pay |
| Family plan (AutoPay, invoices, more pots) | Subscription; test after retention exists |

## 6. Cash-out path
Today `/cashout` is a **mock screen** — no real money leaves to a bank. The "saved vs bank wire" figure is an **estimate** (3% + $5), not a measured fee.
Real path needs licensed partners per country: on/off-ramp providers licensed for digital dollars, local payout networks (bank transfer / instant-payment rails), and a partner for outward remittance from India. No partner talks yet — `TODO(real data)`.

## 7. Risks and what's needed next
| Risk | Today | Next |
|---|---|---|
| Licensing differs per corridor (India outward-remittance and digital-asset tax rules; UK/UAE regulators) | Testnet only; no real money | Legal read per corridor; partner holds the licence |
| Testnet only | Test dollars, no value | Mainnet deploy + audit of money-moving contracts |
| Sybil / relayer cost (we pay the network fee) | Relay 600/h per IP + 200/day per account; test-dollar drip 100/day per IP + 2/week per account | Captcha or device attestation at signup |
| Shared networks hit limits | A venue/campus on one IP can briefly see "slow down" | Per-device limits once attestation exists |
| No user evidence | No real-family tests yet | 5 recorded tests before submission, 100 users in 90 days |

## 8. Milestones
| By | Goal |
|---|---|
| Day 30 | 5+ recorded user tests; 1 student group running a circle or trip; first pain quotes; corridor confirmed `TODO(real data)` |
| Day 60 | 100 accounts, 30%+ make a first send (target, not a forecast); captcha/attestation at signup; partner shortlist for cash-out |
| Day 90 | Mainnet pilot with capped amounts in one corridor (only with a licensed partner); D7 return measured; pricing test on one hypothesis |
