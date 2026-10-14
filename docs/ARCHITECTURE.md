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

## Known gaps (accepted for testnet; fix before real money)
- **Sybil accounts spend relayer gas.** Limits are per IP (relay 600/h, faucet 20/day) and per account (relay 200/day, faucet 2/week), but new accounts are free and unlimited, so a script can rotate accounts and drain relayer MON. Fix: captcha or device attestation (Play Integrity / App Attest) at signup, plus a global daily gas budget.
- **`PUSHER_SECRET` must be rotated** before mainnet (it was exposed in a chat session on Oct 3). Rotate in Pusher → update `app/.env.local` + Vercel env.
- **Read APIs trust signed headers only.** Anyone holding a valid EIP-191 header for an address can read that address's payment graph (who paid whom). Money moves still need a fresh user signature + onchain checks. Fix: short-lived session tokens everywhere, per-route authz review, body signing, encrypt notes/messages at rest.
- **Cash-out rupee leg is practice.** Dollars really settle on testnet (KinCashoutV2 → Agora Instant Settlement pair); no INR moves. Mainnet KinCashoutV2 is deployed but not Agora-approved and not used by the app ("Coming soon").
- **Mainnet relayer health isn't monitored.** `/api/health` reads the testnet balance only; check mainnet MON by hand (runbook below).

## Mainnet runbook (chain 143)
Real-money mode = balance, send (EIP-3009), receive, add money (Aurora → KinAddMoney), activity. Programs, names and links stay on testnet. Mainnet addresses: `contracts/deployments/143.json`.

**App env (Vercel production, all set as of Oct 13)** — `app/.env.example` doesn't list these yet:

| Var | Value / note |
|---|---|
| `NEXT_PUBLIC_KIN_ADDMONEY` | KinAddMoney `0xdF70AaC88E464c78cDe367B5d2879776C2994102` (empty → relay answers "not available") |
| `NEXT_PUBLIC_KIN_CASHOUT_V2_MAIN` | KinCashoutV2 `0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476` (UI shows "Coming soon" in real mode regardless) |
| `NEXT_PUBLIC_KIN_CASHOUT_V2` | testnet KinCashoutV2 `0xca36cE5954E4C4058216b19622106525A894ad37` (practice cash-out) |
| `AURORA_API_KEY` | server only; Add money quotes/status |
| `MAINNET_RPC_URL` | optional, relayer writes; default `https://rpc.monad.xyz` |
| `NEXT_PUBLIC_ALCHEMY_KEY` | reads go Alchemy → `rpc.monad.xyz` → `rpc1.monad.xyz` |
| `RELAYER_PRIVATE_KEY` | same key on both nets; server only |
| `ENVIO_API_TOKEN` | mainnet activity via `143.hypersync.xyz` |

Mainnet AUSD (`0x0000…a9012a`), USDC, Agora pair and Uniswap v4 pool addresses are constants in `app/src/lib/chain.ts` / `cashoutRoutes.ts`, not env.

**Deploy** (deployer needs MON; `contracts/.env` has the testnet AUSD — override it):
```sh
cd contracts && set -a && source .env && set +a
export AUSD=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a USDC=0x754704Bc059F8C67012fEd69BC8A327a5aafb603 \
  POOL_MANAGER=0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e POOL_FEE=50 POOL_TICK_SPACING=1
~/.foundry/bin/forge script script/DeployAddMoney.s.sol --rpc-url monad --private-key $DEPLOYER_PRIVATE_KEY --broadcast --slow
SETTLE_TOKEN=$USDC AGORA_PAIR=0xf33286E3222D1c829dACeac48c0Ec651F6452470 \
  ~/.foundry/bin/forge script script/DeployCashoutV2.s.sol --rpc-url monad --private-key $DEPLOYER_PRIVATE_KEY --broadcast --slow
```
Both write `deployments/143.json`. No `AGORA_WHITELISTER` on mainnet: Agora approves the contract itself.

**Verify** (MonadVision/Sourcify, no key). KinAddMoney is verified; KinCashoutV2 isn't yet:
```sh
~/.foundry/bin/forge verify-contract 0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476 src/KinCashoutV2.sol:KinCashoutV2 --chain 143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(~/.foundry/bin/cast abi-encode "constructor(address,address,address,address,uint24,int24,address)" \
    $AUSD $USDC 0xf33286E3222D1c829dACeac48c0Ec651F6452470 $POOL_MANAGER 50 1 0x0000000000000000000000000000000000000000)
curl -s "https://sourcify-api-monad.blockvision.org/check-all-by-addresses?addresses=<addr>&chainIds=143"   # want "partial" or "perfect"
```

**Relayer funding**: relayer `0x355ae4f093346c4C27E09737E383deBb02eEAA5f` pays gas on both nets. Keep ≥ 10 MON on mainnet (Monad reserve-balance rule; `/api/health` uses the same threshold but reads testnet only). Oct 13: mainnet 9.91 MON, testnet 21.98 MON.
```sh
~/.foundry/bin/cast balance 0x355ae4f093346c4C27E09737E383deBb02eEAA5f --rpc-url https://rpc.monad.xyz --ether
```

**Smoke check (read-only)**:
```sh
R=https://rpc.monad.xyz; C=~/.foundry/bin/cast
$C call 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a "eip712Domain()(bytes1,string,string,uint256,address,bytes32,uint256[])" --rpc-url $R  # "Agora Dollar","1",143
$C call 0xdF70AaC88E464c78cDe367B5d2879776C2994102 "ausd()(address)" --rpc-url $R                                               # mainnet AUSD
$C call 0xf33286E3222D1c829dACeac48c0Ec651F6452470 "hasRole(string,address)(bool)" APPROVED_SWAPPER 0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476 --rpc-url $R  # false until Agora approves
cd contracts && ~/.foundry/bin/forge test --fork-url $R --match-contract MainnetFork                                         # local fork, sends nothing
```
Then in the app: Me → Money → Real money on → send ≥ $0.01 (relay minimum on mainnet) to a second account → receipt + explorer link on monadvision.com.
