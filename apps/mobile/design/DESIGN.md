# AfriStage Mobile — Design System (extracted from design/ mockups)

Source mockups: `feed, room, profile.png`, `GoLive$missionControl.png`, `livestge&admin.png`.

## Palette (matches existing `AfriColors` — keep)
- stage bg `#07070A`, surface `#0E0E13`, elevated `#17171F`, border `#242433`
- primary orange `#FF8A1F`, gold `#FFC857` (coins/balance), purple `#7C3AED` (Go Live / avatar rings)
- success green `#22C55E` (money +), live/alert red `#EF4444`
- text `#FAFAFA`, secondary `#D4D4D8`, muted `#A1A1AA`
- Subtle warm/purple radial glow behind dark backgrounds.

## Signature components (THE GAP — build these)
1. **AfriLiveCard** — full-bleed cover image, bottom gradient scrim, top-left red `● LIVE` pill,
   top-right `👁 1.2K` viewer pill, bottom title (bold white) + creator row. Radius 18-20.
   Cover fallback when no image: category gradient + large creator initial.
2. **AfriHeroLive** — same but full-width, ~220h, larger type, optional category tag.
3. **AfriCreatorRing** — circular avatar with gradient/gold ring, name below.
4. **AfriGiftBar** — horizontal scroll of gift tiles: colored icon + name + `🪙 price`.
5. **AfriCoinPill** — gold coin + balance, in the app bar.
6. **AfriBottomBar** — Home · Search · **center orange circular Go Live** · Wallet · Profile;
   notification badge support.
7. **Stat cards** — colored icon chip + big value + label (dashboard/wallet/profile overview).
8. **AfriBalanceCard** — gold gradient wallet balance + Buy coins / Transactions.

## Screens
- **Feed**: app bar (wordmark + search + coin pill + bell) → hero live → "Live now" h-scroll of
  AfriLiveCard → category chips → "Creators to watch" rings → bottom bar.
- **Room**: full-bleed creator video/photo, top bar (back, creator+LIVE, viewers, close),
  floating gift animations, overlaid chat rows (semi-transparent), AfriGiftBar, chat input.
- **Profile/Creator dashboard**: avatar header, Overview stat grid, Earnings card + Payout,
  Top supporters list, Go Live, bottom bar.
- **Wallet**: AfriBalanceCard (gold), Earnings summary, settings menu list.

## Type
Bold white headings (w800), medium body, muted captions. Wordmark: "AfriStage" white + "Live" orange.
