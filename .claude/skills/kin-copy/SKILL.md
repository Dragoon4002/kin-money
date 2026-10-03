---
name: kin-copy
description: Kin UI vocabulary, banned crypto words, and error-to-human copy map. Use whenever writing or editing user-facing text in app/ (labels, buttons, toasts, errors, empty states, onboarding, notifications).
---

# Kin copy rules

Voice: warm, short, family-chat. Sentences ≤10 words on buttons/toasts. Sentence case. Emoji sparingly (1 per message bubble max).

## Vocabulary
| Never say | Say |
|---|---|
| wallet / address / 0x… | account / @name / phone |
| AUSD / token / stablecoin / USDC | dollars / money / balance |
| gas / fee (network) | — (don't mention; it's free) |
| sign / signature / approve | confirm with Identity check |
| transaction / tx / hash / block | payment / transfer / receipt |
| confirmed / finalized | delivered ✓✓ |
| mint / claim tokens | get money / collect |
| smart contract / escrow | locked for you / held safely until … |
| stream / per-second | grows every second / live allowance |
| ROSCA / pool | circle / pot |
| seed phrase / private key | backup (only in Settings → Backup) |
| blockchain / onchain / web3 / crypto / Monad | — (only on Details → Proof of payment) |

## Errors (map every failure)
| Source | Copy |
|---|---|
| Mera `PASSKEY_OPERATION_FAILED` | "Identity check was cancelled. Try again." |
| Mera `PRF_UNAVAILABLE` | "This device can't hold a Kin account. Use your phone's built-in password manager." |
| Mera `SESSION_ENDED` | "Locked for safety. Confirm with Identity check." |
| insufficient balance | "Not enough in your balance. Add money first." |
| relay 4xx/5xx, RPC timeout | "Couldn't send right now. Your money is safe — try again." |
| name not found | "No one on Kin with that name yet. Send a link instead?" |
| signature expired | "That took too long. Let's try again." |
| unknown | "Something went wrong. Your money is safe." |

Always reassure money is safe on failure. Never render `err.message`.

## Money display
Local currency via `Intl.NumberFormat(locale, { style: "currency", currency })`, 2 decimals. Show dollar amount secondary only when currency ≠ USD: "₱2,800 · $50".
