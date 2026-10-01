# Monad — dev reference

Checked 2026-10-01. `[V]` = verified on-chain via `~/.foundry/bin/cast` (1.8.3). `UNVERIFIED` = not confirmed.

## Networks

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | `10143` [V] | `143` [V] |
| Currency | MON (18 dec) | MON (18 dec) |
| Version | v0.15.2 / MONAD_NINE | v0.15.2 / MONAD_NINE |
| WMON | `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541` | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | same |
| EntryPoint | v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| Permit2 | — | `0x000000000022d473030f116ddee9f6b43ac78ba3` |

Testnet was reset from genesis 2025-12-16 (old testnet addresses dead).

## RPC

Testnet:
- `https://testnet-rpc.monad.xyz` (QuickNode; 50 rps, 25 rps for eth_call/estimateGas) [V]
- `https://rpc.ankr.com/monad_testnet` (300 req/10s)
- `https://rpc-testnet.monadinfra.com` (MF, 20 rps)
- Alchemy: `https://monad-testnet.g.alchemy.com/v2/<KEY>` — UNVERIFIED (host responds, needs key)

Mainnet:
- `https://rpc.monad.xyz` / wss (QuickNode, 25 rps, batch 100) [V]
- `https://rpc1.monad.xyz` (Alchemy, 15 rps, no debug_/trace_)
- `https://rpc2.monad.xyz` (Goldsky, 300/10s, batch 10, historical state)
- `https://rpc3.monad.xyz` (Ankr, 300/10s, no debug_)
- `https://rpc-mainnet.monadinfra.com` (MF, 20 rps, batch 1, historical state)
- Alchemy keyed: `https://monad-mainnet.g.alchemy.com/v2/<KEY>` — UNVERIFIED

## Explorers

- Testnet: https://testnet.monadvision.com (Sourcify/BlockVision), https://testnet.monadscan.com (Etherscan). Socialscan `https://monad-testnet.socialscan.io` — UNVERIFIED (returned 429). viem's `monadTestnet` still lists stale `testnet.monadexplorer.com` (redirects).
- Mainnet: https://monadvision.com, https://monadscan.com, https://gmonads.com (net viz), Phalcon/Tenderly (traces), Jiffyscan (UserOps).

## Faucets (testnet MON)

- https://faucet.monad.xyz (official)
- https://faucet.quicknode.com/monad

## Contract verification (Foundry)

`foundry.toml` (docs recommend):
```toml
eth-rpc-url = "https://testnet-rpc.monad.xyz"   # mainnet: https://rpc.monad.xyz
chain_id = 10143                                 # mainnet: 143
metadata = true
metadata_hash = "none"
use_literal_content = true
```

MonadVision (Sourcify, no key):
```sh
forge verify-contract <addr> <ContractName> --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```
Monadscan (Etherscan v2 key; api `https://api.etherscan.io/v2/api?chainid=<id>`):
```sh
forge verify-contract <addr> <ContractName> --chain 10143 \
  --verifier etherscan --etherscan-api-key $ETHERSCAN_API_KEY --watch
```
Swap `--chain 143` for mainnet. Socialscan flags: UNVERIFIED (not in docs).

## Timing

- Block time: 300 ms per docs summary page (measured testnet: 1000 blocks / 302 s ≈ 0.3 s) [V]. viem chain defs say `blockTime: 400` (stale).
- Finality: voted/speculative 1 block (~300 ms), finalized 2 blocks (~600 ms), verified (state root) 3 blocks (~900 ms).

## Gas quirks

- **Charged on gas LIMIT, not gas used**: cost = `value + gas_bid * gas_limit`. Don't over-pad gas; relayer should use estimate × ~1.1–1.25.
- Min base fee 100 MON-gwei (observed `eth_gasPrice` 102 gwei both nets [V]; base fee 100 gwei mainnet [V]). EIP-1559 otherwise normal.
- Per-tx gas limit 30M, block 150M.
- Reserve balance: 10 MON default; EOAs can't spend below reserve in some cases (delegated 7702 EOAs cannot drop below 10 MON). Relayer wallet needs >10 MON headroom — relevant on mainnet.
- Storage: 128-slot pages; cold access priced per page. Some opcodes/precompiles repriced.
- Memory expansion linear, 8 MB/tx cap.

## EVM / tooling compat

- Fork: Fusaka; all opcodes through Fusaka. Solidity: any version with `evm_version = "prague"`/`"osaka"` fine (UNVERIFIED which default docs prefer; Fusaka ⇒ osaka ok with solc ≥0.8.29).
- Tx types 0,1,2,4 (EIP-7702). **No type 3 (blobs)**.
- Precompiles 0x01–0x11 + **P256 verify at 0x0100 (EIP-7951)** — passkey sig verification on-chain + staking precompile 0x1000.
- Max contract size **128 KB** (Eth 24 KB); initcode 256 KB.
- 7702-delegated EOAs can't CREATE/CREATE2.
- No global mempool (txs forwarded to next leaders); full nodes lack arbitrary historical state (use rpc2 / monadinfra for historical).
- Recommended: Foundry ≥1.8, viem ≥2.40.0.

## viem

`import { monad, monadTestnet } from "viem/chains"` — both exist (viem 2.57.1 checked).
- `monad`: id 143, rpc `rpc.monad.xyz`,`rpc1.monad.xyz`, explorer Monadscan + MonadVision, multicall3.
- `monadTestnet`: id 10_143, rpc `testnet-rpc.monad.xyz`, explorer stale (`testnet.monadexplorer.com`), multicall3.
Override explorer if needed: `{...monadTestnet, blockExplorers:{default:{name:"MonadVision",url:"https://testnet.monadvision.com"}}}`.

## Sources
- https://docs.monad.xyz/developer-essentials/network-information
- https://docs.monad.xyz/developer-essentials/testnets
- https://docs.monad.xyz/developer-essentials/differences
- https://docs.monad.xyz/developer-essentials/summary
- https://docs.monad.xyz/guides/verify-smart-contract/foundry
- https://cdn.jsdelivr.net/npm/viem@latest/chains/definitions/monad.ts , .../monadTestnet.ts
- on-chain `cast chain-id|gas-price|base-fee|block` against testnet-rpc.monad.xyz / rpc.monad.xyz
