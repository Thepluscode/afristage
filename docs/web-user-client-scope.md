# Web User Client — Scope (landing-first)

Scoping a browser-based user experience for AfriStage, walked as a **first user**
does it — starting at the landing page. Today the only user product is the Flutter
mobile app; the sole web deploy is the admin console + a `/site` marketing page.

## The finding that sets the scope: the landing is a front door to nothing

Walk it as a cold visitor:

- **`apps/landing/index.html`** — editorial marketing. Every CTA ("Claim your
  stage", "Apply to perform", "Join the audience") is an **in-page `#begin`
  anchor**. Dead ends. And the hero copy literally promises:
  > "Watch every stage on the continent **free — no card required**"
  …with **nowhere to watch**.
- **`apps/admin-web/app/site`** (the deployed public page) — its primary CTAs
  ("Join beta", bottom "join") point at **`/login`**, the **admin** console. A
  first user who clicks "join" lands on an admin sign-in screen.

**So this isn't a feature to justify — it's a promise already made and pointed at,
with no destination built.** The landing already sells the exact MVP ("watch live,
free, no card"). The web client's job is to *fulfil that promise*, starting where
the user already starts: the landing page.

## Premise gate (Rule 0)

**Premise:** a cold visitor who lands, taps "watch," and instantly sees a live
stream in the browser (no 196 MB APK — that install already failed on-device,
#176) will watch, then convert (sign up → buy coins → gift). The landing copy is
already betting on the first half; the client tests the second.

**Cheapest kill-test (½ day, before scaffolding a full app):** make ONE landing
CTA reach a bare page that plays a live staging room via the LiveKit web SDK.
Confirm two things: **(a) a browser actually plays the room**, and **(b) the
guest-token question** — can an un-signed-in visitor get a LiveKit token, or is
auth required before watching? (a) proves feasibility; (b) decides whether
"watch from a link" needs an API change. If watching doesn't play or requires
forced sign-up, the funnel premise is wrong — stop before the two-week build.

## First-user journey = the build order

Each step is the destination the *previous* landing promise should have reached:

| # | First-user step | Reuses | New work |
|---|---|---|---|
| 1 | **Land** on the marketing page, tap "Watch live / Join" | existing landing copy | **repoint the CTAs** at the web app (not `#begin` / admin `/login`) |
| 2 | **Watch a live room** in-browser, guest, no card | LiveKit Cloud + API room tokens (`RoomServiceClient`) | `livekit-client` web viewer; maybe a guest-token endpoint |
| 3 | **Sign up** when they want to gift | `/auth` (same JWT as mobile + admin-web) | lightweight register/login UI |
| 4 | **Buy coins** | `createCheckoutIntent` → provider **hosted** checkout (works in any browser, no PAN → SAQ-A intact) | a redirect button |
| 5 | **Send a gift** | gift endpoint (MoneyService split, ledger-backed) | gift UI on the room |
| 6 | **Wallet + minimal profile** | `/wallet`, `/users/me` | read-only screens |

~5 screens against **existing endpoints** — assembly, not new backend (bar the one
possible guest-token add).

## Explicitly OUT of the MVP (don't build a second full client)

Web go-live/broadcasting, creator dashboard + analytics, payouts, missions,
events, circles, search, moderation, notifications, support, account-deletion UI.
Creators stay on mobile. Each is a later phase *if the funnel converts* — not day one.

## Architecture (reuse, don't reinvent)

- **New app `apps/web`** — Next.js 14, mirroring `admin-web`'s toolchain + the
  proven JWT-over-httpOnly-cookie auth-proxy pattern (#182). Separate app, **not**
  bolted onto admin-web (different audience + auth; don't entangle the console).
- **Live video:** `livekit-client` (JS) against the same LiveKit Cloud project.
- **Landing:** repoint the existing `apps/landing` (and/or `/site`) CTAs at
  `apps/web`. Keep the marketing page; just give its buttons a destination.
- **API:** unchanged REST — MVP needs **no new endpoints** except possibly a
  guest room-token path (the Phase-0 question).
- **Deploy:** a 5th Railway service `web`, same `railway.toml` + `RAILWAY_DOCKERFILE_PATH`
  pattern as admin-web.

## Phasing

| Phase | Slice | Proves |
|---|---|---|
| **0** | Kill-test: one landing CTA → bare page plays a staging room; answer the guest-token question | feasibility + the funnel premise |
| **1** | MVP: land → watch → sign up → buy coins → gift → wallet (steps 1–6) | the money + growth loop on web |
| 2 | Full viewer: feed, search, creator profiles, follow, missions | retention |
| 3 | Creator-on-web: desktop go-live, dashboard | creator supply |

## Effort (rough, honest)

- Phase 0: **~½ day** — repoint one CTA + a `livekit-client` page + the token check.
- Phase 1 MVP: **~1–2 weeks**, one dev. Long pole is the **LiveKit web viewer UX**
  (autoplay-with-sound is browser-blocked → tap-to-unmute; iOS-Safari WebRTC
  quirks; reconnect) + the guest-token endpoint if missing. The rest is CRUD
  against live endpoints + wiring the hosted-checkout redirect.
- Phases 2–3 are additive and independently shippable.

## Risks

1. **Guest room tokens — ANSWERED (the linchpin, resolved during scoping):**
   `POST /live-rooms/:id/join-token` is `@UseGuards(JwtAuthGuard)` → **watching a
   stream requires sign-in today.** The room *read* endpoints (`GET /live-rooms`,
   `/upcoming`, `/:id`) are **unguarded** → a guest can browse/discover what's live
   without auth. So a cold visitor can *see* rooms but can't *press play*. This
   forces one product decision for Phase 1:
   - **A — keep the promise literal:** add a guest join-token path (a view-only,
     no-publish LiveKit token for an anonymous identity). Small, well-scoped API
     add; makes "watch free, no card" literally true → best funnel, matches the
     landing copy.
   - **B — soft sign-up wall:** browse-free, but a lightweight register/login gate
     before the stream plays. No API change; captures the lead; dents the
     "no-friction" promise. Common in live apps.
   Recommendation: **A** for the viewer, since the landing already promises it and
   the whole premise is low-friction reach; keep the sign-up gate at the *gift/buy*
   action (where it's expected anyway).
2. **Mobile-web LiveKit** — autoplay/mute policies + iOS Safari; the viewer must
   degrade to tap-to-unmute gracefully.
3. **Second-client maintenance tax** — every future user feature now has two
   fronts. The viewer-and-money-loop-only MVP is what bounds it; resist parity creep.

## Recommended first GO

**Phase 0, landing-first.** Repoint one landing CTA ("Watch live") to a bare
`livekit-client` page pointed at a live staging room, and answer the guest-token
question. Half a day tells us if the promise the landing already makes can be
kept — before committing to the two-week MVP.
