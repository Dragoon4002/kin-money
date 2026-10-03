# Porting a web page to native

**Files.** Web `app/src/app/<path>/page.tsx` → `mobile/src/app/<path>.tsx` (index of a folder: `<path>/index.tsx`). Web `[id]/page.tsx` → `<path>/[id].tsx`, read with `useLocalSearchParams<{ id: string }>()`. Page-local components go in `mobile/src/components/<feature>/`, never under `src/app/` (every file there is a route). Edit only your own pages + your one line in `lib/nav.ts`.

**Libs (same names/exports as web).** `lib/programs` (pots, jars `isJar`, `listOldPots`, circles, streams, escrows, `createdId`, `txEvents`, `nowSec`, `same`, `ZERO`), `lib/mandates`, `lib/potLinks`, `lib/circleLinks`, `lib/giftLinks`, `lib/claimLink`, `lib/trips`, `lib/split`, `lib/reminders`, `lib/icons` (`ICON`, `IconName`), `lib/money`, `lib/contacts` (`api`, `Person`), `lib/names`, `lib/live`, `lib/abi`, `lib/config` (`addr`, `API_BASE`, `publicClient`, `explorerTx`). Links use `API_BASE` instead of `location.origin`; local storage = `expo-secure-store` sync `getItem/setItem` (keys `[A-Za-z0-9._-]` only).

**Contracts.** Writes only via `call(addr.x, XAbi, "fn", args, { fund? })` from `lib/tx` (gasless, waits for receipt). Never touch `account.ts`/`tx.ts`/`keys.ts`. Wrap in `useAction().run(say => …)` for busy/status/human errors.

**Kit** (`@/components/programs/kit`): `useMe`, `useLoad(fn, key)`, `useNow`, `useAction`, `useName`, `Who`/`PotFor` (render inside `<Text>`), `WhoAvatar`, `MoneyInput` (+ `fromLocal`), `Choice`, `Sheet` (Modal), `Status`, `Empty`, `Loading`, `timeLeft`, `dateLabel`, `localParts`, `share`, `getMeta/setMeta`, `jarMeta/jarKey`, `OldPots`.
**People:** `@/components/PersonPicker` (`PersonPicker`, `Person`) — same props as web.

**UI** (`@/components/ui`): `Screen` (title/back/scroll), `Button`, `ErrorText`, `Text`/`TextInput` (always these, not RN's — brand font), `Serif`, `Label`, `Field`, `Band`, `Row` (both full-bleed, like web `Screen wide`; drop web `Pad`), `IconTile icon={ICON.x}`, `Chip`, `Avatar`, `Keypad`, `useInputStyle`, `useTheme` tokens. No Tailwind/className.
**Bottom action:** last child of `<Screen>` is `<Footer><Button …/></Footer>` — pinned to the bottom above the safe area (web `mt-auto`). One primary action per screen.

**Routing.** Add one line to `NATIVE` in `lib/nav.ts`: `"/pot": "/pot",` and for dynamic `"/pot/[id]": "/pot/[id]",`. List static siblings too (`"/pot/join"`) or `[id]` will swallow them. `openKin(path)` for every in-app link: query → params, `#frag` → param `hash` (link parsers accept it without `#`). Unlisted paths fall back to the web app. Inside your own screens `router.push` is fine.

**Copy.** `.claude/skills/kin-copy` + banned words in `docs/PRODUCT.md`: no 0x, token names, gas, wallet, chain. Money via `formatMoney`. Errors via `humanError` (never `err.message`). >2s actions show status copy. 44px targets.

**Hermes gotchas.** No `URL`/`URLSearchParams` (use `lib/query.ts` / hand parsing), no `localStorage`/`window`/`navigator`, `Intl.formatToParts` may be missing. Bigint OK. `crypto.getRandomValues` is polyfilled.

**Verify.** `cd mobile && npx tsc --noEmit && npx expo lint` clean. No builds/commits unless told.
