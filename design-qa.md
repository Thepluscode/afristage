# AfriStage goal-interface design QA

## Comparison target

- Public source visual truth: `/Users/theophilusogieva/Downloads/Generated image 1 (5).png`
- Public typography source crop: `/var/folders/rq/f10xv9014xj26ppv3pjp7swh0000gn/T/codex-clipboard-a8222e77-99f7-4ad3-8e90-4f17fa890b6c.png`
- Public feature-card source crop: `/var/folders/rq/f10xv9014xj26ppv3pjp7swh0000gn/T/codex-clipboard-0fca5279-7ae9-470b-9bdf-94e50e8bd1df.png`
- Public offer-card source crop: `/var/folders/rq/f10xv9014xj26ppv3pjp7swh0000gn/T/codex-clipboard-afbf46e9-7fb3-42b8-ab81-9f52123d03af.png`
- Admin login placement source crop: `/var/folders/rq/f10xv9014xj26ppv3pjp7swh0000gn/T/codex-clipboard-1a4afc9f-5cb6-4c43-85dc-2b432d446e66.png`
- Mobile source visual truth: `/Users/theophilusogieva/Downloads/Generated image 1 (4).png`
- Landing gap comparison supplied by the user: `/var/folders/rq/f10xv9014xj26ppv3pjp7swh0000gn/T/codex-clipboard-150cd4c9-7ca5-4f6d-bb70-6593aa34ca44.png`
- Mobile gap comparison supplied by the user: `/var/folders/rq/f10xv9014xj26ppv3pjp7swh0000gn/T/codex-clipboard-6a669d2e-5383-4101-a2c6-0edd62911f94.png`
- Public implementation screenshot: `/Users/theophilusogieva/.codex/visualizations/2026/07/20/019f8168-8ef6-7d23-b63b-4e8b1874df57/afristage-site-goal-implementation.png`
- Public combined comparison: `/Users/theophilusogieva/.codex/visualizations/2026/07/20/019f8168-8ef6-7d23-b63b-4e8b1874df57/afristage-site-comparison.png`
- Public typography/motion implementation screenshot: `/Users/theophilusogieva/projects/ai/afristage/.playwright-mcp/afristage-type-motion-why.png`
- Public feature-card implementation screenshot: `/Users/theophilusogieva/projects/ai/afristage/afristage-feature-cards-with-images-v2.png`
- Public offer-card implementation screenshot: `/Users/theophilusogieva/projects/ai/afristage/afristage-offer-cards-with-images.png`
- Admin login implementation screenshot: `/Users/theophilusogieva/projects/ai/afristage/afristage-login-placement-fixed.png`
- Current landing implementation screenshot: `/Users/theophilusogieva/projects/ai/afristage/afristage-landing-glow-pass-v4-native.jpg`
- Current mobile implementation captures: `/Users/theophilusogieva/projects/ai/afristage/mobile-captures/home.png`, `live-room.png`, `go-live-setup.png`, `creator-dashboard.png`, and `wallet.png`
- Mobile implementation screenshots: `afristage-mobile-home.png`, `afristage-mobile-go-live.png`, `afristage-mobile-creator.png`, and `afristage-mobile-wallet.png` in the same visualization directory
- Mobile combined comparison: `/Users/theophilusogieva/.codex/visualizations/2026/07/20/019f8168-8ef6-7d23-b63b-4e8b1874df57/afristage-mobile-comparison.png`
- Public viewport/state: supplied target 1536×1024; final in-app browser capture 1280×720 at its native desktop viewport, `/site`, hero at page load. The full hero region was compared by composition and relative proportions rather than claiming equal-pixel coordinates across different aspect ratios.
- Mobile viewport/state: 390×844, dark theme; populated viewer home, live room with gift drawer open, creator dashboard, Go Live setup, and wallet.
- Admin login viewport/state: 856×1336, dark theme, signed out; responsive checks also completed at 390×844, 390×568, and 390×480.

## Current landing-card findings

- No actionable P0/P1/P2 differences remain in the current feature-card imagery pass. The supplied two-column composition, icon/number alignment, serif hierarchy, radii, and gold-on-black palette are preserved while the previously empty lower card regions now contain real cinematic imagery.
- No actionable P0/P1/P2 differences remain in the current offer-card imagery pass. Each offer now has a distinct product-relevant scene, the action is anchored to the card base, and the third offer spans the 856px grid instead of leaving an unused column.

## Current admin-login findings

- No actionable P0/P1/P2 placement differences remain. The supplied state placed the form below the visible fold because the card was centered within an unusually tall layout viewport. The corrected shell uses a capped, viewport-relative top offset, preserves horizontal centering, and provides vertical overflow for short screens.

## Current landing and mobile findings

- No actionable P0/P1/P2 differences remain in the current landing exposure pass. The final native-width browser capture keeps the complete navigation, Join Beta control, performer, live panel, audience, and CTAs visible while carrying the reference's stronger right-side spotlight and warmer subject exposure.
- No actionable P0/P1/P2 differences remain in the current five-state mobile pass. Home now fits the creator rail above the persistent navigation; live room shows the goal's open gift-drawer state; Go Live keeps all fields, four settings, and the primary action in the first viewport; creator dashboard and wallet retain their complete first-screen hierarchy.
- Go Live uses a dedicated creator-control studio scene instead of recycling the viewer-home performer artwork.

- [P3] The public brand mark is the closest library icon, not the final custom vector.
  - Location: public hero navigation.
  - Evidence: the source has a bespoke AfriStage monogram; no production logo asset exists in the repository.
  - Impact: minor brand-fidelity difference, with no usability impact.
  - Fix: replace the icon when the approved vector mark is available.

## Required fidelity surfaces

- Fonts and typography: public display type now uses one centralized high-contrast Georgia stack across every landing headline, card title, proof figure, editorial number, and product statement; compact gold labels and body copy use the restrained Avenir-style UI stack. Mobile uses platform-native UI typography rather than a runtime font request, preserving offline startup and the compact product hierarchy.
- Spacing and layout rhythm: public hero height, headline hierarchy, CTA row, subject placement, and live overlay follow the reference. Mobile uses the same compact 390×844 first-screen density: Home includes the creator rail, Go Live exposes its action above navigation, the creator dashboard shows all four metrics and three supporters, and wallet keeps the complete account menu in view.
- Colors and tokens: black stage, warm gold, creator purple, teal live states, green earnings, and muted graphite surfaces align across both products.
- Image quality and asset fidelity: the public page uses the exact clean stage photograph plus seven generated 1672×941 card assets with one coherent warm-gold, purple, teal, and near-black direction. Each card uses a dedicated focal crop and a legibility overlay rather than a placeholder treatment. Mobile ships dedicated photographic assets for Zola, Kofi, Nandi, T-Flow, and the Go Live studio preview; all load in the deterministic capture harness.
- Copy and content: the public headline, eyebrow, CTA, story action, navigation, and first editorial section match. Mobile labels and values are driven by actual product models, so fixture amounts differ from the concept image without changing hierarchy.

## Focused comparison evidence

- Public hero details were checked separately for navigation, logo treatment, CTA icon/copy, headline wrap, overlay card, and section boundary; no further focused crop was needed because those details remain readable in the 1536×512 combined comparison.
- Public feature cards were compared together with the supplied 856px reference crop. A focused 856px grid capture verifies all four photographic assets, top-right numbering, gold icons/labels, readable copy, matched radii, and a complete two-column grid. A separate 390×844 browser check confirms four loaded images, 560px card heights, and no horizontal overflow.
- Public offer cards were compared together with the supplied 856px reference crop. The focused post-fix capture verifies three full-bleed photographic stories, the featured gold border, readable serif/sans hierarchy, bottom-anchored actions, and balanced two-column composition. A separate 390×844 browser check confirms three loaded images, consistent 470px card heights, and no horizontal overflow.
- Mobile details were checked together with the supplied source board in five full-height 390×844 captures: populated viewer home, live room with the gift drawer open, Go Live setup, creator dashboard, and wallet. The dense gift grid and Go Live form were also legible in focused views, so no further crop was required.

## Comparison history

1. First mobile render found a 92 px overflow in the wallet earnings-summary header and a runtime font-download dependency. The header now uses a constrained title row, and the theme uses the native Avenir face with platform fallback behavior.
2. The revised 390×844 render removed the overflow and retained the intended typography, role-aware gold/purple navigation, cards, inputs, and wallet layout.
3. Public comparison found the story CTA and mark treatment drifting from the source. The CTA now uses the Play icon and `Watch the story`; the mark uses the closest available library icon. The post-fix browser render has working `#platform` and `#offer` navigation and no console warnings/errors.
4. The creator dashboard was still materially taller than the goal. Its status banner, section headers, two-row overview, earnings panel, supporter rows, and action spacing were remeasured and compacted. A fresh 390×844 render shows three supporters and the Go Live action without overflow.
5. The wallet header now exposes only the goal's `Support` action while retaining refresh as pull-to-refresh. Balance, summary, and menu surfaces were compacted so the account actions occupy the same first-screen density as the goal.
6. Gift tiles now use a configured raster `animationUrl` as artwork and retain the icon-library fallback for unsupported or failed media; parsing is covered by the mobile suite.
7. The supplied typography crop exposed display-type drift below the `Why AfriStage` section. The landing now has one display token for hero, platform, process, offer, proof, and final CTA copy. An 856×1336 browser render and computed-style audit confirm every `h1`/`h2`/`h3` resolves to the same Georgia stack.
8. Motion now follows one editorial sequence: hero copy and the live-room preview enter in order, chat and reactions trail behind, sections reveal on intersection, and process-detail changes replay a short transition. `prefers-reduced-motion` removes all non-essential movement.
9. The supplied card crop exposed large visually empty regions. Four distinct cinematic creator images were generated and placed as full-bleed card media. The first browser pass found the card number pulled to the left and the fourth card stranded below an empty grid cell; the selector specificity and 856px grid rules were fixed. The post-fix capture shows 01–04 aligned top-right and all four cards in a balanced two-column grid.
10. The supplied offer crop exposed the same empty-card problem across beta, economy, and control offers. Three distinct story images now fill those cards, links are anchored to the lower edge, and the third card spans both columns at 856px. The focused browser comparison and 390×844 responsive check show no remaining P0/P1/P2 issue.
11. The supplied login crop showed the form beginning 452px down the 856×1336 layout viewport and being clipped by the visible browser area. The corrected render begins at a capped 96px offset, keeps the complete 430px card visible, and falls back to document scrolling without horizontal overflow at 390×480.
12. The supplied landing comparison exposed underexposure and a smaller, flatter hero subject. The hero now uses a warmer radial light field, a lighter directional scrim, a softer section fade, a 115% stage image treatment, and a gold-lit live-frame shadow while preserving text contrast.
13. The supplied mobile comparison exposed missing icon glyphs, oversized card/navigation geometry, and a repeated Go Live image. Visible controls now use bundled Cupertino icons, shared theme density is tighter, the center action is a distinct circular control, and Go Live has dedicated studio artwork.
14. The first post-icon pass still left three P1/P2 fidelity gaps: Home pushed the creator rail below the fold, the creator `Go Live` tab opened analytics instead of setup, and the setup CTA was clipped below the first viewport. The rail/cards and shared controls were compacted, creator navigation now maps to Home/Analytics/Go Live/Earn/Profile, and schedule/chat controls moved into compact app-bar/tile interactions. The final 390×844 captures show all three fixes.
15. The first live-room comparison used the room-only state while the supplied design showed the gift drawer open. The final capture now renders the production `AfriGiftDrawer` with eight realistic gifts, balance, selection, and Send action over the live stage. The same-state comparison has no remaining P0/P1/P2 gap.
16. The landing remained visibly flatter after the first exposure pass. A second image-backed screen layer, stronger gold spotlight, lighter directional scrim, larger display type, and brighter live-panel glow produced the final native 1280×720 browser capture while retaining readable contrast and all primary controls.

## Primary interactions and technical evidence

- Public `Watch the story` scrolls to `#platform`.
- Public `Join beta` scrolls to `#offer`.
- Public process tabs update their detail content; `Go live` was browser-verified against the expected copy.
- Public typography audit: every landing `h1`, `h2`, and `h3` resolves to `Georgia, "Times New Roman", serif` at weight 400.
- Public card-image audit: seven of seven assets load at 856px and 390px; both checked layouts have no horizontal overflow.
- Admin login placement audit: card bounds are `x=213, y=96, width=430, bottom=529` at 856×1336 and `x=24, y=84, width=342, bottom=538` at 390×844. A 390×480 viewport produces vertical scrolling with zero horizontal overflow, keeping every form control reachable.
- Browser console warnings/errors: no application warnings/errors in the final `/site` render.
- Admin web: focused landing tests passed; optimized Next.js build passed. A concurrent full-suite rerun was discarded because duplicate Vitest runners caused unrelated timeouts; the last clean baseline remains 342/342.
- Mobile: `flutter analyze` clean; full-suite baseline 339 passed with the capture-only test skipped by default; the final focused navigation/live-room/widget/capture suite passed 127/127.

## Current implementation checklist

1. No additional P0/P1/P2 changes remain for the landing exposure/composition, landing-card imagery, mobile icon/density/navigation, gift-drawer state, Go Live first-viewport fit, or admin-login placement passes.

## Broader follow-up checklist

1. Confirm the five refreshed mobile states on a physical device before promotion to `VERIFIED`.
2. Replace the temporary library mark when the approved AfriStage vector is supplied.

final result: passed
