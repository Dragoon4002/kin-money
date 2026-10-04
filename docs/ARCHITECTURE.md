# Kin — Architecture

```
 Phone (PWA, Next.js)                      Next.js API (same deploy)            Monad testnet (10143)
 ┌───────────────────────────┐   signed    ┌────────────────────────┐   tx     ┌──────────────────────────┐
 │ Mera passkey → PRF 32B    │  payloads   │ /api/relay             │ ───────▶ │ AUSD (EIP-3009, permit)  │
 │ → BIP39/32 → EOA key      │ ──────────▶ │  simulate → send       │          │ KinForwarder (ERC-2771)  │
 │ viem LocalAccount (mera)  │             │  gas = est × 1.2       │          │ KinNames / KinEscrow /   │
 │ signs EIP-712 only        │             │ /api/faucet (test $)   │          │ KinStream / KinPot /     │
 └───────────────────────────┘             └────────────────────────┘          │ KinCircle                │
                                                                                └──────────────────────────┘
```

## Decisions
| Decision | Choice | Why |
|---|---|---|
| Account | Mera PRF → BIP39 → `m/44'/60'/0'/0/0` EOA | Mera bounty: Mera = entire account layer. No backend custody. |
| Gasless P2P send | AUSD `transferWithAuthorization` (EIP-3009), relayer submits | Recipient + amount in signed data → relayer can't redirect. |
| Gasless contract calls | OZ `ERC2771Forwarder` + `ERC2771Context` in every Kin contract | One uniform path; `_msgSender()` = user. |
| Funding contracts | Contract calls `AUSD.receiveWithAuthorization(from=_msgSender(), to=this, …)` | One signature, no approve step, can't be front-run. |
| Relayer | Next.js route handler, key in `RELAYER_PRIVATE_KEY` | No extra service. Holds only MON for gas, never user funds. |
| Names | `KinNames` onchain `@handle → address` | No database; judges see it's real. |
| Phonebook | Neo4j Aura Free via `/api/contacts`, `/api/requests` | Graph fits who-knows/pays-whom: frequent payees, friends-of-friends suggestions, request bubbles. Holds names/addresses/edges only — never keys or balances. |
| Indexing | Envio HyperIndex (`indexer/`, `ENVIO_GRAPHQL_URL`) → Envio HyperSync (`ENVIO_API_TOKEN`) → `eth_getLogs` | Typed `Activity` rows per person; each source falls through to the next (`app/src/lib/server/history.ts`). |
| Scheduling | Pull-based (claimable after time) | No keeper needed. CRE only if time (bonus $3k). |

## Contracts (`contracts/src`)
| Contract | Features | Core logic |
|---|---|---|
| `KinForwarder` | all | OZ `ERC2771Forwarder`, name "Kin". |
| `KinNames` | 3 | `claim(handle)`, `resolve(handle)`, `nameOf(addr)`. One name per address. |
| `KinEscrow` | 3 (claim link), 10, 14, 15, 17 | Lock `{from, to\|claimKey, amount, unlockAt, approver, expiresAt}`. `release` when unlocked ∧ (no approver ∨ approved). `refund` after expiry. Claim link: `to=0`, `claimKey` = ephemeral address in link; claimer submits sig from ephemeral key over their own address. |
| `KinStream` | 5, 9 | `{payer, payee, ratePerSec, start, stop, withdrawn}`. `withdraw` accrued, `pause/cancel` refunds unstreamed to payer. |
| `KinPot` | 13 | Members + target; `contribute`; auto-pays beneficiary when `balance ≥ target`; per-member totals. |
| `KinCircle` | 11, 12 | N members, fixed contribution, round length. Each round all pay → payout to `order[round]`. Deposit slashed on miss, split to others. |

Rules: Solidity 0.8.30, custom errors, events for every state change (feed reads events), no upgradeability, no admin keys. AUSD = 6 decimals.

## App (`app/src`)
```
app/                    Next.js App Router
  (screens)/            home, send, request, allowance, circle, pot, gift, invoice, claim/[code], details
  api/relay/route.ts    validates + submits forwarder / EIP-3009 payloads
  api/faucet/route.ts   drips test AUSD to new accounts (testnet only)
lib/
  account.ts            Mera ceremonies → session → viem account (module scope, never React state)
  chain.ts              monadTestnet w/ MonadVision explorer, publicClient
  contracts.ts          addresses + ABIs (copied from contracts/out by script)
  sign.ts               EIP-3009 + ERC-2771 typed-data builders
  money.ts              6-dec bigint ↔ local currency display
```

## Graph model (Neo4j)
```
(:Person {address, name, createdAt}   // legacy phoneHash props inert (phone lookup removed))
(:Person)-[:KNOWS {label, since}]->(:Person)          // saved contact ("Mum", "Ravi")
(:Person)-[:PAID {count, total, last}]->(:Person)       // upserted after each confirmed payment
(:Person)-[:REQUESTED {id, amount, note, status, at}]->(:Person)   // request-as-message (#18)
```
Auth for writes: client signs EIP-191 message `Kin contacts <address> <timestamp>` with Mera account; route verifies with viem `verifyMessage` (±5 min). No sessions table.
Risk: Aura Free pauses when idle (UNVERIFIED exact window) — wake it before judging; onchain features work without it.

## Security
- **Rule-7 deviation (user decision, Oct 3):** Me → Security can reveal the Kin account's 24 words + private key (fresh Face ID pinned to the credential, never stored/logged, auto-hidden on background, clipboard wiped after 60s) and import keys from other wallets. Mera stays the only account layer; nothing goes to a server.
- Imported keys at rest: `kin.imported` = `[{address, iv, ct, name?}]`, AES-256-GCM under HKDF-SHA256(passkey PRF, salt `kin.import.v1`, info = address) (`lib/keys.ts`; WebCrypto on web, @noble on mobile). Only `unlock()` (Face ID) decrypts them into in-memory sessions; `lock()` ends all; PRF zeroed after.
- Active account persisted by address only (`kin.active`); `getAccount()`/`tx` sign with it; read tokens per address. Checks: `app/scripts/check-keys.mts`.

## Env
See `app/.env.example`, `contracts/.env.example`. Testnet AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, faucet `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` (`requestFunds(address)`).

## Risks
- **Passkey RP ID = domain.** Every hostname = different account. Fix one prod domain on day 1; never demo on Vercel preview URLs.
- **Desktop PRF** only with iCloud Keychain / Google Password Manager / 1Password. Bitwarden/Dashlane → `PRF_UNAVAILABLE`.
- **Monad charges gas limit.** Always explicit `gas` = estimate × 1.2.
- **Relayer nonce** under concurrent serverless calls — single-flight queue; acceptable for demo.
