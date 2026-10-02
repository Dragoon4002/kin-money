# Kin — Product Spec

> Talise moves money like a message. Kin makes money that behaves — it streams, pools, and unlocks by itself.

## Target
- **Track:** Monad Metropolis — Consumer Products & Payments ($10k × 3). Deadline **2026-10-14 09:29 IST**.
- **Bounty 1:** Agora — Best Cross-Border Payments App ($10k): mobile app, send AUSD across borders, Mera passkey onboarding, instant settlement.
- **Bounty 2:** Monad Foundation — Best Mera-Powered UX ($2.5k): Mera = entire account layer. No seed phrase, no extension, no custody backend.
- **Optional add-ons:** Chainlink CRE ($3k, scheduled releases), Envio ($1k, activity feed indexing).
- **Never:** Privy / Dynamic (replace Mera → kills both bounties).

## Audience (verticals)
| Vertical | Who | Role |
|---|---|---|
| Family ⭐ | Diaspora workers + parents of international students | Primary — Agora cross-border sends |
| Circles | Diaspora communities running susu/tanda/chit funds | Originality hook |
| Freelancers | Emerging-market freelancers paid by foreign clients | Secondary; cut first |

Corridor for user testing: **TBD** (see open questions in `tasks/todo.md`).

## Competition (same track)
- **Homeward** — Mera + AUSD PWA, gasless link sends, standing orders, CRE, Envio, Kimi.
- **TakumiPay** — Expo + Mera + AUSD, SEA QRIS merchants, Kimi agent.
→ Plain "send home" is taken. **Lead demo + pitch with programmable features (9–15).**

## Features
Tier: **M** must, **S** should, **X** stretch. 🅰 = AUSD cross-border (Agora).

### Base (Talise parity, customized)
| # | Feature | One-liner | Tier |
|---|---|---|---|
| 1 | Passkey signup | Mera Face ID → account. No email, no password, no seed. | M |
| 2 | Dollar balance | Holds AUSD, displayed in user's local currency. | M |
| 3 | Send by name/link 🅰 | Send to `@alice`, or WhatsApp claim link for non-users (refund after 7d). | M |
| 4 | Gasless | Relayer submits signed authorizations; user never sees gas. | M |
| 5 | Instant receipt | ~1s settle, "delivered ✓✓" tick like chat. | M |
| 6 | Private notes | Encrypted note + hidden amount in feed. | X |
| 7 | Goal savings | "Fly home fund" vault (yield if available). | S |
| 8 | Cash-out + savings counter | Mock offramp screen + "saved $X vs Western Union". | X |

### Kin originals
| # | Feature | One-liner | Tier |
|---|---|---|---|
| 9 | Allowance stream 🅰 | Parent streams allowance per-second to kid abroad; pause / claw back. | M |
| 10 | Emergency unlock 🅰 | Kid taps Emergency → parent one Face ID → instant release. | M |
| 11 | Savings circle 🅰 | Cross-border ROSCA; contract enforces rotation + payout. | M |
| 12 | Commit deposit | Circle defaulter forfeits locked deposit to others. | S |
| 13 | Family pot 🅰 | Siblings in different countries pool for parents; auto-pays when full. | M |
| 14 | Earmarked send 🅰 | Money only payable to named payee (school, hospital, landlord). | M |
| 15 | Invoice escrow 🅰 | Freelancer pay link; milestones auto-release if client silent N days. | M |
| 16 | Auto-split payday | Incoming pay splits → savings / home / tax. | S |
| 17 | Conditional gift 🅰 | "$500 when you graduate" — date + guardian confirm. | S |
| 18 | Request as message | Chat bubble "Need $50 for books 📚" with Pay button. | M |
| 19 | Trust score | On-time payment streak → portable reputation. | X |
| 20 | Share receipt | Clean receipt image → WhatsApp. | S |

### UPI-style additions (inspired by Ching Pay / UPI)
| # | Feature | One-liner | Tier |
|---|---|---|---|
| 21 | My QR | Personal QR = `kin.app/@name`; scan to pay, works with phone camera. | M |
| 22 | Scan & pay | In-app camera scans any Kin QR/link → amount → Face ID. | S |
| 23 | Phonebook | Contacts from graph DB: recents, frequent payees, "people you may know". | M |
| 24 | Collect request | UPI-style collect: payee requests, payer approves with Face ID (pairs with #18). | M |
| 25 | AutoPay mandate | Approve a recurring pull once (rent, subscription) — capped, cancel anytime. | S |
| 26 | Split a bill | Pick contacts, split evenly/custom, sends collect requests to each. | S |

## Invisible-blockchain rules (Design & Craft = 20%, judged harshly)
Banned in UI copy: wallet, address, gas, token, AUSD, Monad, chain, tx/transaction hash, sign, seed, crypto, blockchain, web3, mint, approve.
Exception (user decision, Oct 3): the opt-in **"Other wallet"** sheet on My QR / request cards may say "wallet", "wallet address", "AUSD" and "Monad" — it exists only to let people pay from external wallets. Main text still shows "Pay to @name", never the raw address.
Use: account, balance, dollars, send, request, pay, Face ID, receipt, delivered.
Explorer links only behind "Details → Proof of payment" for judges.

## Judging map
| Criterion | Weight | How Kin scores |
|---|---|---|
| Technical execution | 20% | Real onchain conditional logic: stream math, escrow conditions, ROSCA rotation. No simulation. |
| Design & craft | 20% | Invisible blockchain rules above; one-tap flows. |
| Originality | 15% | Circles + allowance stream + earmarked money = things banks can't do. |
| Founder/market | 25% | Named corridor, user interviews, real pain quotes. |
| Traction | 20% | 5+ user tests recorded; distribution plan (community groups, student associations). |
