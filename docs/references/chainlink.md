# Chainlink (CRE + Data Feeds) on Monad: dev reference

Checked 2026-10-12. `[V]` = verified (onchain with `~/.foundry/bin/cast`, or the official doc/page linked). `UNVERIFIED` = not confirmed.

## Bounty

- Metropolis lists one Chainlink bounty, **"Best workflow with CRE", $3,000** [V summary of https://monad.xyz/metropolis; full rules on the application platform].
- The "scheduled releases" wording and whether a simulation-only entry qualifies: **UNVERIFIED**. Check the bounty rules or Discord. Safe route: deploy if access comes through, and otherwise show `cre workflow simulate --broadcast` producing real Monad testnet txs.

## What CRE is

- Chainlink Runtime Environment. Workflows (TS or Go, compiled to WASM) run on a DON: **trigger → callbacks → capabilities** (EVM read/write, HTTP, consensus).
- TS SDK: **`@chainlink/cre-sdk`**, latest `1.23.0` [V `npm view`, modified 2026-09-29]. Go SDK also exists.
- CLI: `cre`, latest **v1.38.0** [V github.com/smartcontractkit/cre-cli/releases]. Install: `curl -sSL https://app.chain.link/cre/install.sh | bash` [V docs] (run it yourself, the guardrail hook blocks pipe-to-shell).
- Commands: `cre login`, `cre init`, `cre workflow simulate <wf> [--broadcast] --target staging-settings`, `cre workflow deploy`, `cre workflow supported-chains`, `cre account access`.
- **Simulate**: runs locally against real chains. Writes are a dry run by default; `--broadcast` sends real txs signed by `CRE_ETH_PRIVATE_KEY` (must hold gas). In simulation, writes go through the **MockKeystoneForwarder** [V https://docs.chain.link/cre/guides/operations/simulating-workflows].
- **Deploy**: needs **deploy access approval** (`cre account access` opens a request reviewed by email). Simulation needs no approval [V https://docs.chain.link/cre/account/deploy-access]. A private registry lets you deploy with no wallet or gas [V https://docs.chain.link/cre/guides/operations/deploying-workflows].

### Triggers [V https://docs.chain.link/cre/guides/workflow/using-triggers/]
- **Cron**: `new CronCapability().trigger({ schedule: "0 0 9 * * *" })`, 5 or 6 fields, `TZ=Asia/Kolkata ...` prefix allowed, **minimum interval 30 s**.
- **EVM log**: filter by contract address and topics; `confidence: "CONFIDENCE_LEVEL_FINALIZED"` optional.
- **HTTP**: an external POST starts the workflow (authorized keys).

## Monad support [V https://docs.chain.link/cre/supported-networks-ts, updated 2026-09-18]

| | CLI | Go SDK | TS SDK | chain name |
|---|---|---|---|---|
| Monad mainnet | v1.29.0+ | v1.17.0+ | v1.18.0+ | `monad-mainnet` |
| Monad testnet | v1.30.0+ | v1.19.0+ | v1.19.0+ | `monad-testnet` |

Forwarders [V https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts + `cast call typeAndVersion()`]:

| | Simulation (`MockKeystoneForwarder 1.0.0`) | Production (`KeystoneForwarder 1.0.0`) |
|---|---|---|
| Testnet 10143 | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` [V] | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` [V] |
| Mainnet 143 | `0x9eF6468C5f37b976E57d52054c693269479A784d` [V] | `0x76c9cf548b4179F8901cda1f8623568b58215E62` [V] |

Tenant-enabled chains may differ: confirm with `cre workflow supported-chains`.

## Receiver interface [V https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts]

```solidity
interface IReceiver is IERC165 {
  function onReport(bytes calldata metadata, bytes calldata report) external;
}
```
- `metadata` = `abi.encodePacked(bytes32 workflowId, bytes10 workflowName, address workflowOwner)` (62 bytes).
- `report` = ABI bytes from the workflow. The forwarder calls `onReport`, so **the existing Kin contracts can't receive a report directly**. Use a thin receiver: check `msg.sender == forwarder` (mock address for simulation, real address for production) and the workflow owner, then call the permissionless Kin functions.
- `supportsInterface` must return true for `IReceiver`. Docs ship a `ReceiverTemplate` (forwarder address set in the constructor).
- Report gas is paid by the DON (or by your key during `--broadcast` simulation). The user still pays nothing, so Hard Rule 2 holds.

## Data Feeds on Monad [V https://reference-data-directory.vercel.app/feeds-monad-mainnet.json; values read via cast]

Mainnet (109 feeds). Fiat feeds: **EUR/USD** `0x00D7E359c8CE46168eFDD4D65b708fFb16c4b99a` [V live], GBP/USD `0x1ffC8B75a16FFfbd7879F042B580F7607Dcf5C30`, JPY/USD `0xF64664Ea54cE47eCC7a1816C49d1Bc6deF828927`, CAD/USD `0x3293eA5650E9f8c4091642b7EB1C46CFEe5197cA`. **AUSD/USD** `0xE20751C7B5867bCBef815ffc1b284c3f412a9e13` (8 dec) [V live] and `0x91D9c75fe73e25f22d9F5e0C6a2a5eC48B6bFBeB` (18 dec) [V live]. MON/USD and USDC/USD also listed.
- **No USD/INR, USD/AED, USD/PHP or USD/MXN on Monad** [V absent from the directory]. INR has to come from an HTTP fetch inside the workflow (consensus across nodes), which is what CRE is good at.
- Testnet (5 feeds, all marked hidden): USDT, USDC, BTC, LINK, ETH vs USD. No fiat.
- Data Streams on Monad: UNVERIFIED (streams networks page has no Monad hit). Automation: Monad not listed on the supported-networks page [V no hit]. **CCIP**: Monad mainnet lane directory exists [V https://docs.chain.link/ccip/directory/mainnet/chain/monad-mainnet].

## Kin keeper surface today

- `app/src/app/api/cron/autopay/route.ts` (Vercel cron, daily): `KinMandate.collect(id)` for `due(id)>0` and `KinGiftLink.open(id)` once `unlockAt` has passed and the gift has a recipient. Both are permissionless; the relayer pays gas. It also sends push reminders.
- Permissionless and time-gated: `KinMandate.collect`, `KinGiftLink.open`, `KinEscrow.release` (unlock/autoApprove), `KinCircle.settle` (after `roundLength`, defaults members who missed).
- Owner-only, so they can't be automated without a contract change or a pre-signed 2771 request: `KinEscrow.refund`, `KinGiftLink.refund`, `KinStream.withdraw`, `KinPot.close`. KinPot already pays out inside `contribute`, so it needs no keeper.
