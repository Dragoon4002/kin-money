# Kin — Design system & UI direction

**Positioning:** not a wallet. *Money your family and friends run together* — it streams, pools, unlocks, and has a character (Kinko) that grows with your habits.

## Tokens (single source: `app/src/app/globals.css`)
- Every color is a CSS variable defined once with `light-dark(light, dark)`. Modes: system (default), light, dark via `<html data-theme>`; `lib/theme.ts` `getTheme/setTheme`.
- Use token classes only: `bg-bg bg-surface bg-surface-2 border-line text-ink text-muted bg-brand text-brand-ink bg-brand-soft text-good/bad/warn bg-fun-1..5 text-fun-ink bg-kinko`. In SVG use `var(--token)`.
- **Never** hex/rgb/hsl, `text-white`, `bg-black`, or Tailwind palette colors (`bg-red-500`) in components. Opacity modifiers on tokens are fine (`bg-good/15`).
- Fonts: `font-sans` (Plus Jakarta Sans) for UI; `font-display` (Instrument Serif) for money figures, big numbers, celebratory headlines.

## Visual language
- Dark-first premium (near-black warm bg, raised dark cards, hairline borders), works in light too.
- Money = huge serif numerals, cents dimmed (`<Amount>`).
- Round dark icon buttons with labels underneath for quick actions (`<IconButton>`).
- Uppercase section bands (`<Band>` in `<Screen wide>`) + list rows (`<Row>`) for details/settings.
- Pill tabs (`<Tabs>`), status chips (`<Chip>`), progress rings (`<Ring>`), big countdowns (`<Countdown>`).
- Playful layer — reserved for celebration/social: Kinko character, bright `fun-*` Moments cards, confetti. Keep core money flows calm.
- Floating bottom nav, pill shaped, raised center action.

## Kit (`components/ui.tsx`)
`Screen{title,back,action,wide}` · `Button{variant: primary|soft|ghost|ink}` · `Card` · `Band` · `Row` · `IconButton` · `Amount{value,size}` · `Tabs` · `Chip{tone}` · `Ring` · `Countdown` · `Field`/`inputClass` · `Avatar` · `funBg(name)` · `ErrorText` · `Delivered`

## Navigation
Floating nav: **Home** `/home` (keypad) · **Money** `/money` · center **＋ Pay** `/send` · **Explore** `/explore` · **Activity** `/activity`. Avatar top-right on Home/Money/Explore → `/me` (Kinko + profile + settings).

## Screen map
| Screen | Pattern |
|---|---|
| `/home` | Greeting + Kinko mini, "Check balance ⌄" reveal, big keypad amount entry → **Send** / **Request** (prefill amount), People row (recents) |
| `/money` | Serif balance, "Add money" (testnet gift), pocket cards: Live allowance, Jars, Family pots, Circles (live values) |
| `/explore` | Bento: Pay a bill (categories), Chores, Gifts, Invoice, Circles, Kinko & Kin Score, Invite & earn, This month's spends |
| `/send` | To (recents avatars + @name), huge amount, note, category, single "Send now" |
| `/details?tx=` | Receipt: "Paid ₹474" serif + ✓, To, date, note chip, category (editable), Details band with copyable rows, Share, Proof of payment (explorer) |
| `/activity` | Tabs All/Sent/Received + **Moments** (bright fun cards of recent payments) + list |
| `/spends` | Month total serif, month line chart (SVG), category bars |
| `/me` | Kinko big, @handle, Kin Score/level, Customize → `/kinko`, Appearance (System/Light/Dark), currency, Invite, Lock |
| `/kinko` | Closet: Skins / Expressions / Accessories tabs, locked items show unlock rule, "Wear" button |
| `/invite` | Invite & earn: both get a Kinko item; WhatsApp share; `?ref=` stored |
| `/chores` | Parent posts chore (+$2) → kid "Done" → parent Face ID OK → paid (KinEscrow approver=parent) |
| `/jars` | Savings goal ring "63% saved", entries list, confetti + Kinko on goal reached (KinPot, self as member+beneficiary) |
| `/circle/[id]` | Circle table: member Kinkos around a ring, spotlight on whose turn, round `<Countdown>` |

## Copy
`kin-copy` skill. No crypto words. Celebrate with warmth ("You did it! 🎉"), reassure on errors.

## References
Private screenshots in `references/` (gitignored, confidential — view for layout inspiration only; never copy assets, brand names, or personal data).
