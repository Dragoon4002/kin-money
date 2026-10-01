---
name: monad-deploy
description: Deploy and verify Kin contracts on Monad testnet (10143) or mainnet (143) with Foundry, then sync addresses and ABIs into the app. Use when deploying, redeploying, or verifying any contract under contracts/.
---

# Deploy Kin contracts to Monad

Facts: `docs/references/monad.md`. Foundry = `~/.foundry/bin/forge` (not `/usr/bin/forge`).

## 1. Preflight
```sh
cd contracts
~/.foundry/bin/forge build && ~/.foundry/bin/forge test   # must be green
set -a; source .env; set +a                               # DEPLOYER_PRIVATE_KEY, AUSD
~/.foundry/bin/cast balance $(~/.foundry/bin/cast wallet address $DEPLOYER_PRIVATE_KEY) --rpc-url monad_testnet --ether
```
Need ≥1 MON testnet (faucets in monad.md). Mainnet: keep >10 MON (reserve balance rule).

## 2. Deploy
Script `script/Deploy.s.sol` deploys in order: `KinForwarder` → `KinNames`, `KinEscrow`, `KinStream`, `KinPot`, `KinCircle` (each `(forwarder, AUSD)`; `KinNames(forwarder)` only), then writes `deployments/<chainId>.json` via `vm.writeJson`.
```sh
~/.foundry/bin/forge script script/Deploy.s.sol --rpc-url monad_testnet --private-key $DEPLOYER_PRIVATE_KEY --broadcast --slow
```
`--slow` avoids nonce races. Monad bills gas limit — if forge overestimates wildly, pass `--gas-estimate-multiplier 120`.

## 3. Verify (MonadVision / Sourcify, no key)
```sh
~/.foundry/bin/forge verify-contract <addr> src/KinEscrow.sol:KinEscrow --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(~/.foundry/bin/cast abi-encode "constructor(address,address)" $FORWARDER $AUSD)
```
Repeat per contract (KinNames: `constructor(address)` with `$FORWARDER` only; KinForwarder: no args). Mainnet: `--chain 143`.

## 4. Sync to app
```sh
{ echo "// Generated from contracts/out by monad-deploy skill. Do not edit."
  for c in KinForwarder KinNames KinEscrow KinStream KinPot KinCircle; do
    echo "export const ${c}Abi = $(jq -c '.abi' out/$c.sol/$c.json) as const;"
  done; } > ../app/src/lib/abi.ts
```
Update `app/.env.local` `NEXT_PUBLIC_KIN_*` + `NEXT_PUBLIC_FORWARDER` from `deployments/<chainId>.json`. Commit `deployments/*.json` and `abi.ts`; never `.env*`.

## 5. Smoke
`cast call <KinNames> "resolve(string)(address)" "test" --rpc-url monad_testnet` returns without revert. Then run one relay flow in the app.
