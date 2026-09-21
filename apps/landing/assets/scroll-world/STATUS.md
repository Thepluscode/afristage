# ScrollWorld — current delivery status

## 2026-09-16 interface refinement — VERIFIED locally

The product-experience section now presents the approved mobile-suite artwork as
five individually framed phone views instead of one undifferentiated collage.
The active card advances automatically, can be selected by labelled tab or card,
and respects reduced-motion preferences. Static HTML still contains all five
views and labels. Desktop and phone renders were inspected; the phone layout
keeps the page within the viewport and exposes the rest through the tab rail.
The React page and standalone page share the same visual treatment and source
artwork. Existing ScrollWorld asset verification remains unchanged.

Evidence: the product rail interaction test passes in the standalone browser
harness; the existing site test suite passes with the new five-card assertions;
the optimized Next.js build passes. This is locally verified, not a production
deployment or conversion lift claim.

## 2026-09-16 correction — VERIFIED locally, not production-deployed

The four selected stills are sufficient. Their originals remain in `generated/`,
including rejected iterations for provenance. Extra still generation is not needed.

The active work is a **four-leg, sequential, native-720p Seedance 2 Mini draft**,
not four unrelated cinemagraphs. Each next request uses the preceding video's
actual final decoded frame. The request explicitly disables audio. The budget
gate checks live pricing and enough funds for the entire remaining sequence;
the initial run is capped at 164 KIE credits (4 × 5 seconds × 8.2 credits/second).
No automatic paid resubmissions are allowed after an uncertain response.

Both the static landing and Next.js `/site` use the same scene data, scoped player
and CSS. All four scenes and the conversion link remain server-rendered/no-JS
content. Animation is disabled until `runtime/manifest.json` is `verified`.
Reduced motion, data saver and playback failures retain the stills.

Reproducible commands, from the repository root:

```sh
npm run test:scroll-world
npx playwright install chromium webkit
npm run test:scroll-world:browser
SCROLL_WORLD_WEBKIT=1 npm run test:scroll-world:browser
node scripts/scroll-world.mjs preflight
node scripts/scroll-world.mjs poll 1
# After visually inspecting each downloaded clip/contact sheet:
node scripts/scroll-world.mjs review 1 'Record the actual observed motion and identity continuity here'
# Submit each later leg only after review of its predecessor:
node scripts/scroll-world.mjs submit 2
# After all four reviewed legs:
node scripts/scroll-world.mjs encode
node scripts/scroll-world.mjs verify
node scripts/scroll-world.mjs sync
```

Journals, provider task IDs, raw renders, actual boundary frames and review hashes
live in ignored `.scroll-world/seedance-mini-v1/`. Keep this directory backed up:
paid raw generations are not reproducible. Delivery encodes and exact-frame
posters live in `media/`. `verify` checks source provenance, frame handoff,
H.264/yuv420p, no audio, faststart, GOP limits, posters and both tiers' three seams
(SSIM ≥0.90). `sync` rejects asset hashes changed after verification.

**Current evidence:** 5 unit checks, 7 existing site tests, and all 12 browser
checks pass in both Chromium and WebKit; optimized Next.js build passes.
Browser checks use an explicitly synthetic video fixture and prove player
behaviour, not generated-film quality. Two real legs completed for 82 credits
total. Leg 1 passed visual review; leg 2's raw provider first frame against leg 1's
actual last frame scored **0.870492 SSIM** in yuv420p, below the **0.90** gate.
The raw file remains immutable. A bounded post-production frame-lock repair
replaced only leg 2's first delivery frame using the exact prior endpoint as the
source; its recompressed delivery handoff now scores
**0.993187 SSIM** and its repaired contact sheet passed visual review. Leg 3 is
submitted sequentially from leg 2's actual raw final frame; the delivery manifest
is now `verified`. Legs 2, 3 and 4 each required the same bounded first-frame repair
(no paid reroll); their repaired handoffs scored **0.993187** and **0.992567**.
Leg 4 is now submitted and awaits provider completion. Nothing
in this section claims production deployment, physical-iPhone validation or
conversion improvement. Browser events are emitted locally as
`afristage:scroll-world`; there is no analytics collection service added here.

The built Next.js route also passed the desktop/phone integration check in both
Chromium and WebKit: static fallback, scoped sticky playback with test fixtures,
no horizontal overflow and the `#offer` conversion link. The test harness uses
local TLS to preserve production CSP (`upgrade-insecure-requests`); its disposable
browser context accepts the self-signed test certificate without changing deployed headers.
Run it against a local, already-built server (do not rebuild beneath the server):

```sh
# With Next.js serving /site on the chosen local port:
SCROLL_WORLD_SITE_URL=http://127.0.0.1:3334/site npm run test:scroll-world:browser
SCROLL_WORLD_SITE_URL=http://127.0.0.1:3334/site SCROLL_WORLD_WEBKIT=1 npm run test:scroll-world:browser
```

Earlier independent video experiments were copied out of temporary storage to
`.scroll-world/prior-independent-experiments/`; they are preserved, not used as
substitutes for the failed continuous chain.

The browser harness is pinned to Playwright 1.62.1 as a dev dependency.
The dependency install reported 40 repository audit findings (4 low, 18 moderate,
15 high, 3 critical); those have not been triaged or repaired in this interface
change. No broad dependency upgrades were performed.

## Historical still-only implementation (superseded)

The notes below describe the earlier still-only implementation and its earlier
local checks. They are not evidence that the new animation is deployed. Old
credit balances and approval labels below are historical, not current blockers.

### Earlier still-only work

The sequence is live in `apps/landing/index.html` as an unnumbered interlude
between §2 Why and §3 Stagecraft — four sticky full-bleed frames, captions
`01`–`04`, and the `#begin` CTA laid over scene 4's reserved dark lower third.

No video, no Remotion, no build step. `position:sticky` carries the sequence
everywhere; a scroll-linked drift (`animation-timeline`) is an enhancement
behind `@supports`, and the captions reuse the page's existing `.rv`
IntersectionObserver reveal.

`generated/*.png` are the 1x masters — committed, because they cost generation
credits and cannot be recreated. The page serves two widths per scene via
`srcset`/`sizes="100vw"`:

| | source | total |
|---|---|---|
| `web/scene-{1..4}.jpg` | 1x masters | 760 KB |
| `web/scene-{1..4}@2x.jpg` | 2560px from the 4x upscale | 1.8 MB |

Phones fetch the 1x set; retina desktops fetch the 2x. Verified with
cache-busted URLs at 390px/dpr1 — both scenes picked the 1x (132 KB, 220 KB).
Chrome will reuse an already-cached larger candidate rather than re-fetch a
smaller one; that costs no extra bytes and is not a selection bug.

## Upscaled locally — no credits, no vendor

The 4K upscale that Higgsfield could not do (workspace at 0 credits) was done
offline with Real-ESRGAN. Free, no API key, no account, GPU-accelerated via
MoltenVK. ~42 s per frame.

    BIN=upscayl-bin            # upscayl/upscayl-ncnn release, macOS universal (arm64 native)
    M=models                   # realesrgan-x4plus.{param,bin}, from the
                               # xinntao/Real-ESRGAN v0.2.5.0 asset
                               # realesrgan-ncnn-vulkan-20220424-macos.zip
    "$BIN" -i generated/<master>.png -o generated/upscaled/scene-N-4x.png \
           -m "$M" -n realesrgan-x4plus -s 4 -f png
    sips --resampleWidth 2560 -s format jpeg -s formatOptions 70 \
         generated/upscaled/scene-N-4x.png --out web/scene-N@2x.jpg

Two traps if this is ever redone:

- **The models are not in the ncnn repo or its own release zips.** No `models/`
  directory on the default branch, and all three v0.2.0 zips ship the binary
  alone. They are in the *parent* repo's `v0.2.5.0` release asset above.
- **Use `realesrgan-x4plus`, not the default.** The other bundled models
  (`realesr-animevideov3`, `-anime`) are illustration models and will wreck
  photographic skin and fabric.

`generated/upscaled/` (91 MB) is gitignored — it is a deterministic derivation
of the committed masters, reproducible from the command above.

**Checked, not assumed:** compared the 4x output against a Lanczos resample of
the identical crop. Real-ESRGAN reconstructed braid, earring and jaw detail the
resample only blurred. It does smooth film grain and partly re-invents fine
jewellery at high magnification — irrelevant here, where every frame sits under
a veil and the page's grain overlay.

Verified in Chrome at 1440x900 and 390x844:

- sticky holds at `top:0` through the scene despite `body{overflow-x:hidden}`
- drift sweeps `scale` 1.14 → 1.02 monotonically, timeline progress 0 → 100%
- zero horizontal overflow from `.sw` at 390px; drift is off on mobile, where
  the frame is a contained panel and scaling would only crop it
- all four captions reveal on scroll-through; 0 console errors/warnings

**Measurement note.** The first drift reading looked frozen at ~1.086 across
2300px of scroll. That was the harness, not the CSS: the page sets
`html{scroll-behavior:smooth}`, so `window.scrollTo(0, y)` was still gliding
when the transform was sampled. Any future scroll-position assertion on this
page must pass `behavior:'instant'`.


| # | Scene | File | State |
|---|---|---|---|
| 1 | Creator preparing to go live | `generated/scene-01-going-live-v1.png` | first attempt, awaiting sign-off |
| 2 | Live performance (anchor) | `generated/anchor-live-stage-v1.png` | **APPROVED** |
| 3 | Gifts through the transparent ledger | `generated/scene-03-transparent-ledger-v3.png` | v3, awaiting sign-off |
| 4 | Payout + continent/diaspora reach | `generated/scene-04-payout-reach-v1.png` | first attempt, awaiting sign-off |

Discarded but kept for the record: scene-03 v1 (wrong woman, interior venue,
creator enclosed in glass) and v2 (continuity fixed, flow ran outward instead of
inward).

**5 generations spent** — 3 on scene 3 before the reference technique was found,
1 each on scenes 1 and 4 after it.

## Before these ship

All frames are **1k**, the model default — scenes 1/3/4 at 1264x848, the anchor
at 1536x1024. For approved selects, **upscale rather than regenerate**:
regenerating at 2k/4k with the same prompt rolls a new image and loses the
approved composition. See `REFERENCE.md`.

**BLOCKED 2026-08-14 — out of credits.** The 4k upscale of all four selects was
submitted and refused: `Out of credits in the selected workspace`. `balance`
reports `credits: 0`, plan `free`; `list_workspaces` shows one private
workspace, also 0. Preflight (`get_cost`) put the upscale at **2 credits per
image, 8 for the four**. Nothing was charged and no upscale job exists.

Source ids for when credits are topped up (the upscaler does not infer size —
width/height must be passed):

| Scene | image_id | w x h |
|---|---|---|
| 1 | `05f291ec-508d-4663-8eea-7959b7ea3f2a` (job) | 1264x848 |
| 2 anchor | `2f1d0d44-d1e2-42db-888f-6e6bb2aa2609` (media) | 1536x1024 |
| 3 | `c0224018-d614-48b5-bb13-f27e4c6de203` (job) | 1264x848 |
| 4 | `e1de8831-b259-482c-967d-e7e3be643809` (job) | 1264x848 |

The four video legs are blocked on the same balance and cost considerably more
than 8 credits, so the top-up decision covers both.
