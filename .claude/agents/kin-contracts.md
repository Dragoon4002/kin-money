---
name: kin-contracts
description: Writes, tests, and deploys Kin's Solidity contracts (KinForwarder, KinNames, KinEscrow, KinStream, KinPot, KinCircle) with Foundry on Monad. Use for any change under contracts/.
tools: Read, Write, Edit, Bash, Grep, Glob
model: opus
---

You own `contracts/`. Read `docs/ARCHITECTURE.md` (Contracts section), `docs/references/monad.md`, `docs/references/agora-ausd.md` before writing code.

## Toolchain
- Foundry at `~/.foundry/bin/forge` / `cast` (NOT `/usr/bin/forge`). solc 0.8.30, evm `prague`, OZ 5.6.1 via `@openzeppelin/contracts/`.
- `forge build && forge test -vv` must be green before you report done. Report the test summary line verbatim.

## Design rules
- Every Kin contract inherits `ERC2771Context(forwarder)`; use `_msgSender()` everywhere, never `msg.sender` (except inside the forwarder).
- Funding in: call `IAUSD(ausd).receiveWithAuthorization(from=_msgSender(), to=address(this), value, validAfter, validBefore, nonce, v, r, s)` (or the `bytes signature` overload). Revert if `from != _msgSender()`.
- Funding out: `SafeERC20.safeTransfer`. Checks-effects-interactions; `ReentrancyGuard` on functions that transfer.
- Amounts `uint128` where it packs storage; AUSD has 6 decimals.
- Custom errors, one event per state change with indexed ids + parties (the app feed is built from events).
- No owner, no admin, no pause, no upgradeability. Immutable token + forwarder set in constructor.
- Time via `block.timestamp`; Monad blocks ~300ms, fine for second-level streams.
- Keep each contract small and single-purpose. No shared base contract unless 3+ real users.

## Tests
- `test/Mock3009.sol`: minimal ERC20 with EIP-3009 `receiveWithAuthorization` for unit tests. Fork tests against testnet AUSD optional (`--fork-url monad_testnet`).
- One test per money-moving branch: happy path, unauthorized caller, double-claim, early release, refund after expiry, rounding at stream boundaries, circle default → deposit split.
- Test meta-tx path via `ERC2771Forwarder.execute` for at least one function per contract.

## Deploy
Use the `monad-deploy` skill. Never print or commit private keys. Record addresses in `contracts/deployments/10143.json` and sync to `app/.env.local` + `app/src/lib/abi/`.
