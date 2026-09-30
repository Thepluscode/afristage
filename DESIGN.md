# AfriStage — Design System

Visual system. Answers how it looks. Strategy lives in [PRODUCT.md](PRODUCT.md).

**Canonical source: `apps/mobile/lib/core/afri_theme.dart`.** That file is the
system of record; this document describes it. When they disagree, the Dart file
wins and this document is stale.

## Theme

Dark, committed. Not a dark *mode* — there is no light counterpart and none is
planned. A live video stage is a dark room, and the UI is the room the video
plays in.

## Color

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `stage` | `#07070A` | App background. The darkest surface; video sits on it. |
| `surface` | `#0E0E13` | Sheets, nav bars, input fills. |
| `elevated` | `#17171F` | Cards, dialogs, snackbars, floating controls. |
| `soft` | `#20202B` | The step above elevated, used sparingly. |
| `border` | `#242433` | Default hairline. |
| `borderStrong` | `#343445` | Dialog edges and emphasis. |

Four surface steps within 0x19 of each other. Depth here is **near-black on
near-black plus a hairline**, not shadow. Anything relying on a drop shadow to
separate from its background is off-system.

### Accents

| Token | Hex | Meaning |
|---|---|---|
| `orange` | `#FF8A1F` | Primary. Buttons, the brand. |
| `gold` | `#FFC857` | **Money.** Coins, prices, earnings, balances. |
| `premium` | `#FFB000` | Premium/VIP treatments. |
| `purple` | `#7C3AED` | Secondary actions, the shop. |
| `teal` | `#14B8A6` | Focus rings, approved/positive state. |
| `success` | `#22C55E` | Confirmed outcomes. |
| `danger` | `#EF4444` | Destructive: end room, delete. |
| `warning` | `#F97316` | Caution. |

**Gold means money and nothing else.** It is the only reserved colour in the
system. Using gold decoratively breaks the one visual rule the product depends
on: a viewer scanning for what something costs looks for gold.

Strategy: **restrained** on surfaces, **committed** on money. Accents sit well
under 10% of a screen except where value is being stated, where they dominate.

### Ink

| Token | Hex | Use |
|---|---|---|
| `text` | `#FAFAFA` | Primary. |
| `secondaryText` | `#D4D4D8` | Body copy. |
| `mutedText` | `#A1A1AA` | Labels, captions, disabled. |

Contrast note: `mutedText` on `elevated` is roughly **6.3:1** — passing. The same
grey at reduced opacity (a recurring pattern in the widget layer, e.g.
`Colors.white.withValues(alpha: 0.5)`) drops below 4.5:1 and is the system's most
common accessibility failure. Prefer the named token over an ad-hoc alpha.

## Typography

System sans throughout. No custom family is loaded, and none should be added
without a reason that survives the data cost.

| Role | Size | Weight | Tracking | Line height |
|---|---|---|---|---|
| headlineMedium | 29 | 800 | −0.8 | 1.08 |
| headlineSmall | 26 | 700 | −0.5 | 1.12 |
| titleLarge | 22 | 700 | −0.3 | 1.18 |
| titleMedium | 18 | 700 | — | 1.20 |
| bodyLarge | 16 | 400 | — | 1.45 |
| bodyMedium | 14 | 400 | — | 1.45 |
| labelMedium | 12 | 800 | — | 1.20 |

Hierarchy comes from **weight contrast**, not family mixing: 800 against 400 at
similar sizes. Display sizes tighten tracking as they grow; body never does.

The 12px label at weight 800 is the system's signature — small, dense, confident
rather than small and grey.

## Shape and space

- Radius: **12** buttons and inputs · **14** snackbars · **16** cards and
  thumbnails · **24** dialogs · **999** pills and badges.
- Minimum touch target: **44** (buttons), **46** (floating circular controls).
- Elevation is always **0**. Separation is border plus surface step.
- Card borders are always full. **Side-stripe accents are banned.**

## Components

- **Buttons** — Filled is orange with near-black ink (`#170B02`), 44 high,
  radius 12, weight 700. Outlined is a `border` hairline with `secondaryText`.
  Disabled drops to `elevated` + `mutedText`.
- **Pills** — money and status. Radius 999, a 10% tint of the accent, a 24%
  border of the same accent, icon + weight-800 label.
- **Floating room controls** — 46px circles on `elevated` at 92% opacity, a
  coloured hairline (gold for gifts, purple for the shop), and a soft black
  shadow for legibility over video. This is the one place shadow is correct,
  because the surface underneath is unpredictable.
- **Sheets** — `surface` background, drag handle, capped at 70–78% of viewport
  height, `SafeArea` wrapped.
- **Inputs** — filled `surface`, `border` hairline, teal focus at 1.4 width.

## Motion

Currently minimal and largely undesigned; this is the system's weakest area.
What exists: gift flashes, reaction floats, a connection banner. There is **no
documented easing scale and no reduced-motion handling** in the Flutter layer.

Any new motion should: ease out, avoid bounce, animate transform and opacity
rather than layout, and respect `MediaQuery.disableAnimations`.

## Known divergence

`apps/web` runs a different identity: `--stage-bg: #0a0807`, `--stage-gold:
#e9b44c`, and **Georgia serif**. It is drift, not a second brand. Mobile is
canonical; web should be reconciled toward it when that surface is next touched.
Recording it here so the split is a decision rather than an accident.
