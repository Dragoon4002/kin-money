# Kin indexer (Envio HyperIndex)

Typed, queryable activity index for Kin on Monad testnet (chain 10143), fed by HyperSync.

**Indexes:** every event of KinNames, KinEscrow, KinStream, KinPot (+ retired pot `0x58ab…2caD` as `KinPotV1`),
KinCircle, KinMandate, KinGiftLink, and AUSD `Transfer` — stored only when it touches a Kin account
(created by `NameClaimed`) or a Kin contract.

**Entities** (`schema.graphql`): `Account {id, name}` and `Activity` — one row per (log, involved person) with
`kind, contract, event, account, counterparty, amount, token, blockNumber, timestamp, txHash, logIndex, data`
(decoded args JSON) plus `topics`/`rawData` (exact raw log). Feed for one person:
`Activity(where: {account: {_eq: "0x…"}}, order_by: {blockNumber: desc})`.

**Code:** `config.yaml`, `abis/` (event-only, from `app/src/lib/abi.ts`), `src/EventHandlers.ts` (one generic
handler), `src/lib.ts` (pure mapping/skip logic).

## Check (no Docker)
    pnpm i && pnpm codegen && npx tsc --noEmit
    pnpm test          # unit: skip rule, per-account rows, raw rebuild
    pnpm check-real    # real HyperSync slice → lib mapping, asserts exact raw rebuild (ENVIO_API_TOKEN from ../app/.env.local)

## Run locally
`pnpm dev` — needs Docker (Postgres + Hasura, a few GB). GraphQL at http://localhost:8080/v1/graphql.

## Deploy (Envio Cloud, free dev plan; ~1.5k AUSD transfers + Kin events, far under the 100k-event limit)
1. envio.dev → sign in with GitHub → add indexer → repo, root dir `indexer`, config `config.yaml`.
2. Push the deployment branch it asks for; it builds with pnpm and syncs from block 67103075.
3. Copy the GraphQL endpoint → set `ENVIO_GRAPHQL_URL` in the app (Vercel env). History then reads
   HyperIndex first, falling back to HyperSync (`ENVIO_API_TOKEN`), then RPC (`app/src/lib/server/history.ts`).
