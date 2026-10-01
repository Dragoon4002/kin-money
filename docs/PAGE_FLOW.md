# Kin — Page Flow & Feature Map

Legend: ✅ built · 🟡 partial · 🆕 to build · `→` opens · `⇄` swipe tabs · *(overlay)* sheet/modal, no route

## 1. Page flow

```
/  Landing page 🆕  (Notion-style marketing: hero, how it works, features, Kinko, CTA)
│
└── /start  Sign in 🟡  (today lives at "/"; moves here once landing exists)
    ├── Create account
    │   ├── 1. Your name
    │   ├── 2. Face ID → passkey created (Mera)          *(OS prompt)*
    │   ├── 3. Pick @handle (live availability check)
    │   └── 4. Welcome money added → Home
    ├── Unlock with Face ID (returning, same phone) → Home (or ?next=)
    └── "Already have Kin on another phone?" → OS passkey picker → Home
│
└── TABS  ⇄ swipe / carousel nav — order:  Money · Explore · [Home] · People · Activity
    │
    ├── /home  Home (middle slide) ✅
    │   ├── Check balance (reveal)
    │   ├── Keypad amount → Send  → /send?amount=
    │   │                  → Request → /request?amount=
    │   ├── People row → /send?to=@handle
    │   └── Avatar → /me
    │
    ├── /money  Money ✅
    │   ├── Balance · Add (test) money
    │   ├── Live allowance → /allowance → /allowance/[id]
    │   │                                   ├── live ticker · Collect · Stop *(sheet)*
    │   │                                   └── Emergency fund: ask / send now
    │   ├── Savings jars → /jars → /jars/[id]  (ring · add · take out · Celebrate *(overlay)*)
    │   ├── Family pots → /pot → /pot/[id]  (progress · chip in · close)
    │   ├── Circles → /circle → /circle/[id]  (circle table · countdown · join · pay · settle · leave)
    │   └── Chores → /chores  (post · I did it · looks good — pay)
    │
    ├── /explore  Explore ✅  (bento)
    │   ├── Pay a bill → /earmark
    │   ├── Gifts → /gift
    │   ├── Invoice → /invoice → /invoice/new?… (client pays) → /invoice/[ids] (milestones)
    │   ├── Circles · Family pot · Jars · Chores  (same pages as Money)
    │   ├── Split a bill → /split
    │   ├── Kinko & Kin Score → /kinko
    │   ├── Invite & earn → /invite
    │   └── This month's spends → /spends
    │
    ├── /contacts  People ✅
    │   ├── Saved people · Recent · People you may know
    │   ├── Add by @handle (label: "Mum")
    │   └── Person → /send?to= · /request
    │
    ├── /activity  Activity ✅
    │   ├── Moments (bright cards) · All / Sent / Received
    │   ├── Payment → /details?tx=  Receipt (category edit · share · Proof of payment)
    │   ├── Links waiting → take back
    │   ├── Spends → /spends  (month chart · categories)
    │   └── Requests → /requests  (pay / decline incoming)
    │
    └── /me  Me ✅  (from avatar; not a tab)
        ├── Kinko → /kinko  (closet: skins · expressions · accessories)
        ├── My QR → /receive
        ├── Invite → /invite
        ├── Appearance: System / Light / Dark · Currency
        └── Lock · Remove Kin from this phone
│
└── FLOW SCREENS (cover the nav, back returns to origin)
    ├── /send  To · amount · note · category · Send now → /details?tx=&fresh=1
    │          or "Send as a link" → WhatsApp share
    ├── /request  person · amount · note → chat-bubble request
    └── /split  people · total → requests to each

DEEP LINKS (external entry points; route through /start if signed out, then ?next=)
    /claim#<id>.<key>      collect money sent as a link
    /invoice/new?to=…      client pays a freelancer invoice
    /chores?c=…            kid receives a chore
    /send?to=@handle       from someone's QR code
    /?ref=@handle          invite → Kinko reward
```

## 2. Access rules
| Area | Signed out | Signed in, locked | Unlocked |
|---|---|---|---|
| Landing, /start | ✅ | redirect → Home | redirect → Home |
| Tabs, read screens | → /start | ✅ (balances visible) | ✅ |
| Any money movement | → /start | Face ID prompt | ✅ (no prompt for 5 min) |
| Deep links | → /start?next= | Face ID prompt | ✅ |

## 3. Feature list

### Account & identity
| Feature | Where | Status |
|---|---|---|
| Passkey sign-up (Face ID, no seed/password) | /start | ✅ |
| Unlock / auto-lock after 5 min idle | /start, any action | ✅ |
| Restore on new phone via synced passkey | /start | ✅ |
| @handle (onchain name) | /start, /me | ✅ |
| Welcome money (testnet) | /start, /money | ✅ |
| My QR | /receive | ✅ |
| Appearance System/Light/Dark, currency | /me | ✅ |
| Landing page | / | 🆕 |

### Everyday money
| Feature | Where | Status |
|---|---|---|
| Keypad-first send / request | /home | ✅ |
| Send to @handle, gasless, ~1s "Delivered ✓✓" | /send | ✅ |
| Send as WhatsApp link (refund after 7d) | /send, /claim | ✅ |
| Request as message, pay/decline | /request, /requests | ✅ |
| Split a bill (even) | /split | ✅ |
| Receipt + category + share + proof | /details | ✅ |
| Moments cards, activity tabs | /activity | ✅ |
| Spends analytics | /spends | ✅ |
| Scan & pay in-app camera | — | 🟡 (phone camera only) |
| AutoPay mandates | — | 🆕 |

### Programmable family money
| Feature | Where | Status |
|---|---|---|
| Live allowance (per-second stream) | /allowance | ✅ |
| Emergency fund (ask → one-tap release) | /allowance/[id] | ✅ |
| Savings jars + goal celebration | /jars | ✅ |
| Family pot (pool, auto-pays when full) | /pot | ✅ |
| Savings circle (rotation, deposits, defaults) | /circle | ✅ |
| Chores (post → done → OK → paid) | /chores | ✅ |
| Pay a bill (earmarked, family OK) | /earmark | ✅ |
| Invoice with milestone escrow | /invoice | ✅ |
| Conditional gift (date + guardian) | /gift | ✅ |
| Auto-split payday | — | 🆕 |

### Social & delight
| Feature | Where | Status |
|---|---|---|
| Phonebook graph: saved, recent, suggestions | /contacts | ✅ |
| Kinko mascot: skins, expressions, accessories | /kinko | ✅ |
| Unlocks from real payment history + Kin Score | /kinko | ✅ |
| Celebrations (confetti) | overlay | ✅ |
| Invite & earn | /invite | 🟡 (reward not verified) |
| Swipe carousel nav | tabs | ✅ |

### Under the hood (judges)
| Feature | Status |
|---|---|
| Mera passkey EOAs (no custody backend) | ✅ |
| Gasless relay (EIP-3009 + ERC-2771), gas cap, dedupe, rate limits | ✅ |
| 6 contracts on Monad testnet, verified, 34 tests | ✅ |
| Proof of payment (explorer) only on receipt | ✅ |
| Full history via indexer (Envio) | 🆕 |
