# Parallel build brief (prototype, Oct 2026)

Several agents build `app/` at the same time. **Only edit files you own.** Need a change in a shared file? Don't edit it — say so in your final report.

## Shared foundation (read-only for screen agents)
| File | Use |
|---|---|
| `lib/account.ts` | `useAccount()` → `{profile, unlocked}`; `signUp(name)`, `unlock()`, `lock()`, `setName()`, `getAccount()` (auto Face ID) |
| `lib/tx.ts` | `sendDollars(to, units)` (P2P gasless); `call(contract, abi, fn, args, {fund?})` (any Kin write; `fund` appends signed AUSD pull). Both resolve after receipt. |
| `lib/chain.ts` | `publicClient`, `addr.{ausd,forwarder,names,escrow,stream,pot,circle}`, `explorerTx(hash)` |
| `lib/abi.ts` | `KinNamesAbi`, `KinEscrowAbi`, `KinStreamAbi`, `KinPotAbi`, `KinCircleAbi`, `KinForwarderAbi` (typed `as const`) |
| `lib/money.ts` | `formatMoney(units)` local currency; `fromLocal("50")` → units; `toUnits`, `toDollars` |
| `lib/names.ts` | `resolveName("@alice")`, `nameOf(addr)`, `HANDLE_RE` |
| `lib/errors.ts` | `humanError(e)` — ALWAYS use for displayed errors |
| `lib/contacts.ts` | `recordPayment(to, units)`, `recentPeople()` (social agent owns impl) |
| `components/ui.tsx` | see docs/DESIGN.md Kit (Screen, Button, Card, Band, Row, IconButton, Amount, Tabs, Chip, Ring, Countdown, Field, Avatar, funBg, ErrorText, Delivered) |
| `components/PersonPicker.tsx` | `<PersonPicker onPick={(p: Person\|null)=>…}/>` (social agent owns impl) |
| `api/relay`, `api/faucet`, `lib/server/relayer.ts` | gasless submit; `POST /api/faucet {address}` gifts test dollars |

Contract function signatures + events: read `contracts/src/*.sol` (NatSpec) or `lib/abi.ts`. Every fund function ends with `(value, validAfter, validBefore, nonce, signature)` — `call(..., {fund})` fills those; pass only the leading args.

## Ownership (phase 2 — UI redesign; read docs/DESIGN.md)
| Agent | Owns (create/edit) |
|---|---|
| **shell** | `components/core/NavBar.tsx`, `components/core/Keypad.tsx`, `components/core/Onboard.tsx`, `app/page.tsx`, `app/home/**`, `app/money/**`, `app/explore/**`, `app/me/**`, `app/settings/**`, `app/receive/**` |
| **flows** | `app/send/**`, `app/details/**`, `app/activity/**`, `app/spends/**`, `app/claim/**`, `app/contacts/**`, `app/request/**`, `app/requests/**`, `app/split/**`, `components/core/ActivityRow.tsx`, `components/core/share.ts`, `components/social/**`, `components/PersonPicker.tsx`, `lib/activity.ts`, `lib/categories.ts`, `lib/claimLink.ts` |
| **programs** | `app/allowance/**`, `app/circle/**`, `app/pot/**`, `app/earmark/**`, `app/invoice/**`, `app/gift/**`, `app/chores/**`, `app/jars/**`, `components/programs/**`, `lib/programs.ts` |
| **kinko** | `components/kinko/**`, `lib/kinko.ts`, `app/kinko/**`, `app/invite/**` |

Shared (lead only): `components/ui.tsx`, `app/globals.css`, `app/layout.tsx`, `lib/{account,tx,chain,abi,money,names,errors,theme,contacts}.ts`, `lib/server/**`, `app/api/**`.
`components/kinko/Kinko.tsx` exports (`Kinko`, `Look`, `Mood`, `DEFAULT_LOOK`) are a stable contract; kinko agent adds `Celebrate`, `useKinko(address)` in `lib/kinko.ts`.

## Route map (link to these; don't create others' routes)
`/` welcome→signup/unlock · `/home` · `/send` · `/receive` (My QR) · `/claim#<id>.<key>` · `/activity` · `/details?tx=` (receipt + proof) · `/settings` → merge into `/me` · `/money` · `/explore` · `/me` · `/spends` · `/kinko` · `/invite` · `/chores` · `/jars`
`/contacts` · `/request` (ask for money) · `/requests` (incoming collect requests) · `/split`
`/allowance` (+`/allowance/[id]`) · `/circle` (+`[id]`) · `/pot` (+`[id]`) · `/earmark` · `/invoice` (+`[id]`) · `/gift`

## Rules
- Read `CLAUDE.md`, `docs/PRODUCT.md`, `.claude/skills/kin-copy/SKILL.md` first.
- No crypto words in UI (kin-copy). Errors via `humanError`. Money via `formatMoney`.
- Unlocked-only screens: `useRequireAccount()` from lib/account.ts.
- Colors: token classes only (docs/DESIGN.md). No hex/rgb/hsl/palette classes.
- After any successful payment, call `recordPayment(to, units)` (fire-and-forget).
- Verify with `pnpm exec tsc --noEmit --incremental false` and `pnpm lint` only. **Do NOT run `pnpm build`, `pnpm dev`, or `pnpm add`** (shared `.next` / `package.json`). Deps available: viem, mera, qrcode, neo4j-driver.
- Contracts aren't deployed yet (addresses zero). Code must compile; runtime testing happens after deploy.
- Final report ≤15 lines: files created, anything needed from shared files, known gaps.
