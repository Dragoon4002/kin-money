# Agora AUSD — dev reference

Checked 2026-10-01. `[V]` = verified on-chain via `~/.foundry/bin/cast`. `UNVERIFIED` = not confirmed.

## Addresses

| | Testnet (10143) | Mainnet (143) |
|---|---|---|
| AUSD token | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` [V] | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` [V] |
| Faucet | `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` [V] | — |
| Bridge | — | `0x9CaB7Ede13dc56652E44D2404E969C212f22689b` (docs) |
| Implementation (`implementation()`) | `0xc1e3C7D486d6A92fBE920232E439EeC2cEb112dA` | `0xc1e3C7D486d6A92fBE920232E439EeC2cEb112dA` |

- Mainnet address **has no code on testnet** [V]. Use the testnet address above on 10143 (same address on all Agora testnets: Sepolia, Base Sepolia, Arb Sepolia, Fuji, Amoy, OP Sepolia, Katana).
- Both are upgradeable proxies (EIP-1967 admin slot set on mainnet).

## Token facts [V both nets]

- `name()` = `"AUSD"`, `symbol()` = `"AUSD"`, **`decimals()` = 6**
- EIP-712 domain (`eip712Domain()`, ERC-5267): **name `"Agora Dollar"`, version `"1"`**, chainId = net, verifyingContract = token proxy address. Note domain name ≠ `name()`.
- Mainnet `DOMAIN_SEPARATOR()` = `0x995063441ebf2219c94dce05014a545da4390d2362f99b3d7ad456046678cafe`
- `TRANSFER_WITH_AUTHORIZATION_TYPEHASH` = `0x7c7c6cdb…2267` = keccak of standard `TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)` [V]
- `PERMIT_TYPEHASH` = `0x6e71edae…26c9` = standard EIP-2612 `Permit(...)` [V]
- Supply: mainnet ~148.2M AUSD; testnet ~1.30B AUSD.

## Supported signed-transfer methods (selectors found in impl bytecode) [V]

| Function | Selector |
|---|---|
| `transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,v,r,s)` | `0xe3ee160e` |
| `transferWithAuthorization(...,bytes signature)` | `0xcf092995` |
| `receiveWithAuthorization(...,v,r,s)` | `0xef55bec6` |
| `receiveWithAuthorization(...,bytes signature)` | `0x88b7ab63` |
| `cancelAuthorization(authorizer,nonce,v,r,s)` / `(…,bytes)` | `0x5a049a70` / `0xb7b72899` |
| `permit(owner,spender,value,deadline,v,r,s)` | `0xd505accf` |
| `permit(owner,spender,value,deadline,bytes)` | `0x9fd5a6cf` |
| `authorizationState(address,bytes32)` view | callable [V] |
| `nonces(address)` view | callable [V] |
| `isAccountFrozen(address)` view | present (compliance freeze) |

=> Full **EIP-3009 + EIP-2612**, incl. `bytes signature` overloads (USDC v2.2-style; likely ERC-1271 smart-wallet sigs — UNVERIFIED). Mera EOAs sign plain secp256k1, so v/r/s overload is fine.

`receiveWithAuthorization` requires `msg.sender == to` (EIP-3009 spec) — use when a contract (escrow) pulls funds; `transferWithAuthorization` for direct relayed P2P.

## Getting testnet AUSD

Faucet (testnet, proxy at `0xd236…ee6C`): `requestFunds(address recipient)`; 10,000 AUSD/request, max hold 100,000, 1 req/min per docs/3rd-party notes (limits UNVERIFIED). `cast estimate` succeeds (~113k gas) [V]. Caller needs testnet MON for gas.
```sh
~/.foundry/bin/cast send 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C "requestFunds(address)" $ME \
  --rpc-url https://testnet-rpc.monad.xyz --private-key $PK
```
Relayer can call it on behalf of users (recipient param) → onboarding demo can gift test AUSD gaslessly.

## viem signing snippet (EIP-3009)

```ts
const sig = await account.signTypedData({
  domain: { name: "Agora Dollar", version: "1", chainId: 10143, verifyingContract: AUSD },
  types: { TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" } ] },
  primaryType: "TransferWithAuthorization",
  message: { from, to, value, validAfter: 0n, validBefore, nonce }, // nonce = random bytes32
});
```
Better: read domain at runtime via `eip712Domain()` (viem `getEip712Domain`).

## Reference impl: neromtoobad/homeward

https://github.com/neromtoobad/homeward — Metropolis Track 02 remittance PWA, AUSD + Mera, near-identical scope to Kin.
- `server/relayer.ts` — viem walletClient w/ relayer PK; per call: `simulateContract` → `estimateContractGas` → send with gas ×1.25 (Monad bills limit) → `waitForTransactionReceipt`. Serial promise queue for nonce safety. Splits sig into v/r/s via `parseSignature`.
- `contracts/HomewardEscrow.sol` — every deposit via `ausd.receiveWithAuthorization(from, escrow, …, nonce)` where **nonce = keccak256(abi.encode(escrow, "send", to, ref))** → binds recipient/params into signed nonce so relayer can't redirect. `send()` pulls then `transfer(to)` + emits `Sent(from,to,amount,ref)`. Also claim links (ephemeral claim key in URL fragment, EIP-191 claim sig naming recipient), refunds, standing orders (Chainlink CRE).
- `shared/config.ts` — addresses, `AUSD_DOMAIN = {name:"Agora Dollar",version:"1"}`, `AUSD_DECIMALS=6`, `RECEIVE_AUTH_TYPES`, custom `defineChain` for 143/10143.
- `shared/money.ts` — `signReceive()` builds/signs ReceiveWithAuthorization.
- `web/src/lib/keys.ts` — Mera (`@category-labs/mera` ^0.2.0) passkey PRF → account key; session policy.
- Simpler Kin path (no escrow): user signs `TransferWithAuthorization(from,to,…)` with random nonce; relayer calls `transferWithAuthorization` directly. Recipient is in the signed payload, so no redirect risk. Add escrow only for claim links.

## Bounty (Monad Metropolis)

- Agora: "$10,000 Best Cross-Border Payments App on Monad" (+ "$10,000 Best Mobile Trading App"). Task framing reported elsewhere: "Build a mobile app letting users send AUSD across borders using Mera passkey onboarding and instant settlement" — exact wording UNVERIFIED on official page (page lists titles only).
- Related: Monad Foundation "$2,500 Best Mera-Powered UX", "$2,500 Mera: One Passkey, Many Keys"; Track 02 Consumer & Payments $30k / 3 teams.
- Submission: working product + public profile (demo, write-up, code link). **Deadline Oct 13**. Testnet vs mainnet not specified.
- Competitors on same bounty: Homeward, TakumiPay, Polaris, Iris, Noma, Sente.

## Fallback (not needed)

AUSD exists on testnet with faucet + full EIP-3009, so mock unnecessary. If faucet breaks: deploy mock ERC20 with EIP-3009 (e.g. OZ ERC20Permit + copy of Circle `EIP3009` / Solady-based), 6 decimals, domain `{"Agora Dollar","1"}` so client code is unchanged; swap address only.

## Sources
- https://docs.agora.finance/developer/contract-deployments
- https://monad.xyz/developers/hackathons/metropolis
- https://github.com/neromtoobad/homeward (server/relayer.ts, contracts/HomewardEscrow.sol, shared/config.ts, shared/money.ts, README.md)
- on-chain: `cast call` name/symbol/decimals/eip712Domain/typehashes; `cast code` selector grep of impl `0xc1e3…12dA`; `cast estimate requestFunds` on testnet
