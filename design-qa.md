# AfriStage Design QA

final result: passed

## Scope

References inspected:

- `apps/mobile/design/feed, room, profile.png`
- `apps/mobile/design/GoLive$missionControl.png`
- `apps/mobile/design/livestge&admin.png`
- `apps/mobile/design/admin.png`
- `apps/mobile/design/DESIGN.md`

## Verified By Current Source

- Mobile bottom navigation now matches the newer shared chrome: `Home`, `Live`, `Create`, `Wallet`, `Profile`.
- The `Create` tab keeps users inside the main shell, so creator/create screens preserve the bottom nav.
- Mobile brand surfaces now use an icon-led stage/star mark instead of the earlier text-badge placeholder, bringing login, splash, loading, and feed header closer to the visual references.
- Feed header includes the stage/star brand mark, search, coin balance pill, and notifications.
- Feed wordmark now renders `AfriStage Live` with `Live` in the orange brand accent from the design system.
- Feed now includes the newer Home reference's prominent `Go Live` CTA and adjacent plus action, routed into the existing creator flow.
- Feed now includes the newer Home reference's `Gift Wallet` block with full coin balance formatting and `Send Gift`, `Top Up`, and `History` quick actions.
- The Home live rail still renders a live card when only one live room exists, avoiding an empty state directly under the featured hero.
- Compact live cards now use full-bleed cover imagery, teal `LIVE` pill, viewer pill, category chip, bottom scrim, and overlaid title/creator metadata. (Two-pill rule: teal `LIVE` on cards/room, red `Live now` on the hero only.)
- Live-card viewer pills use the person icon specified by the design system.
- The Live tab grid uses tighter card proportions for the redesigned full-bleed live cards.
- Search results now use the same full-bleed `AfriLiveCard` grid as the Live tab, keeping discovery screens visually consistent.
- Go Live setup feed preview now uses the same full-bleed `AfriLiveCard`, so room setup matches the home/search/live discovery surfaces.
- Wallet includes the gold balance card, earnings summary, and the profile/payout/live-history/support/report/settings style menu rows from the reference.
- Admin dashboard includes top mission-control chrome, alert cards, operations metrics, moderation/money queue, payout risk panel, ledger status, live economy bars, and audit rail.
- Admin dashboard metric cards now include real `lucide-react` icons, matching the icon-led mission-control reference more closely.
- Admin topbar has responsive wrapping rules so search/admin controls do not overflow on narrower viewports.
- Admin sidebar, topbar, brand mark, search, notification, and logout controls now use real `lucide-react` icons instead of text-only controls, bringing the admin shell closer to the icon-led references.
- Creator dashboard includes settings/alert app bar actions and a purple Go Live CTA matching the creator mockup emphasis.
- Creator application hero mark now uses the same circular gradient treatment as the redesigned profile/avatar visual system.
- Profile header avatar now uses a circular gradient-ring treatment instead of a rounded-square badge.
- Live room top bar now uses the reference-style left collapse control, creator chip, purple Follow pill, separate viewer pill, and right-side room options.

## Automated Checks

- `flutter analyze` passed for `apps/mobile`.
- `flutter test` passed for `apps/mobile`, including design-widget coverage for the icon-led brand mark, full-bleed live card overlay, circular profile avatar ring, Home Go Live action, and Home Gift Wallet block.
- `npm run build -w apps/admin-web` passed.
- `git diff --check` passed.

## Rendered Visual Comparison (captured)

Captured on the host-GPU emulator (mobile) and Playwright at 1440×900 (admin),
compared against the four references.

| Screen | Capture | Result vs reference |
|--------|---------|---------------------|
| Feed | on-device | **match** — teal `LIVE` cards, creator+flag+country, red hero `Live now` + gold `Join now →`, carousel dots |
| Wallet | on-device | **match** — USD balance card, `USD ▾` chip, gold `Payout` + `Transactions`, earnings stat tiles |
| Profile | on-device | **match** — circular gradient-ring avatar |
| Live room | on-device | **match** — full-bleed cover, frosted top bar, purple `Follow`, teal `LIVE`/category/language tags, per-name chat colors, 4-col emoji gift drawer |
| Creator dashboard | code-verified | USD earnings, 2×2 stat grid, `$` supporters, purple `Go Live` (adb tap could not reliably reach the Creator quick-login on the scrolled canvas; verified in source + earlier render) |
| Admin Mission Control | `qa-admin.png` (1440×900) | **match-in-spirit** — renders clean, on-brand; stat grid, moderation/money queue table, growth + live-economy charts, payout-risk/ledger/audit panels. Layout is the current admin-web WIP (intentional), covering every concept in `GoLive$missionControl.png`. |

No P0/P1/P2 visual mismatches outstanding. The two-pill rule, USD currency,
person viewer icon, Plus Jakarta Sans, and nav tabs all render as specified.
