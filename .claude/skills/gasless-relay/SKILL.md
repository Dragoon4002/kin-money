---
name: gasless-relay
description: Exact pattern for Kin gasless writes — user signs EIP-3009 (AUSD) or ERC-2771 (KinForwarder) typed data client-side, /api/relay submits. Use whenever adding a new write action (send, fund, withdraw, approve, claim) in app/ or a relay-facing contract function.
---

# Gasless write pattern

User account = Mera EOA with zero MON. Every write goes through `/api/relay`. Relayer pays gas, never holds user funds.

## A. Plain send (P2P, feature #3) — EIP-3009 transferWithAuthorization
Client:
```ts
const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
const signature = await account.signTypedData({
  domain: { name: "Agora Dollar", version: "1", chainId, verifyingContract: AUSD },
  types: { TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  primaryType: "TransferWithAuthorization",
  message: { from, to, value, validAfter: 0n, validBefore, nonce },
});
await fetch("/api/relay", { method: "POST", body: JSON.stringify({ kind: "3009", auth: {from,to,value,validAfter:0,validBefore,nonce}, signature }) });
```
Relayer calls `AUSD.transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,signature)` (bytes overload). Recipient is signed → relayer can't redirect.

## B. Contract call (features #5, #9–17) — ERC-2771 via KinForwarder
1. Encode target call: `data = encodeFunctionData({ abi, functionName, args })`.
2. If it moves the user's AUSD into the contract, args include a **ReceiveWithAuthorization** sig (same as A but primaryType `ReceiveWithAuthorization`, `to = target contract`). Contract checks `from == _msgSender()`.
3. Read `nonces(user)` from forwarder. Sign `ForwardRequest`:
```ts
domain: { name: "Kin", version: "1", chainId, verifyingContract: FORWARDER }
types: { ForwardRequest: [
  { name: "from", type: "address" }, { name: "to", type: "address" },
  { name: "value", type: "uint256" }, { name: "gas", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" },
  { name: "data", type: "bytes" }] }
```
`gas` = `estimateGas` of the inner call (from = user, to = target) × 1.2. `deadline` = now + 10 min.
4. POST `{ kind: "2771", request: {from,to,value:0,gas,deadline,data,signature} }`.
Relayer calls `KinForwarder.execute(request)` (OZ `ForwardRequestData` struct includes `signature`, not `nonce`).

## Relayer (`app/src/app/api/relay/route.ts`)
- Allowlist `to`: AUSD (only `transferWithAuthorization` selector) and FORWARDER (only `execute`); forwarded `request.to` must be a Kin contract.
- `simulateContract` first → reject with 400 + human-safe code on revert.
- `gas = estimate * 12n / 10n` (Monad bills limit). Serial queue (module-level promise chain) for nonce safety.
- Return `{ hash }`; client `waitForTransactionReceipt` (~1s).
- Never log signatures with PII; never accept raw calldata to arbitrary targets.

## Checks
- Wrong domain name/version → `invalid signature`. AUSD domain is `"Agora Dollar"`/`"1"` — verify via `getEip712Domain` if in doubt.
- One Face ID per action: Mera session signs without prompting until locked.
