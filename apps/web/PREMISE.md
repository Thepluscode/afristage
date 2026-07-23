# PREMISE — web (AfriStage web user client)

**Premise (the single make-or-break assumption):**
A shareable web link that plays a live room **in-browser, for a signed-OUT
visitor, with no app install** is a viable low-friction acquisition channel — so
a cold visitor can watch, then convert (sign up → buy coins → gift). If a guest
*cannot* obtain a play token on web (or watching is gated behind sign-up), the
"watch free, no card" the landing already promises is undeliverable and a second
client is wasted maintenance. (NOT "can a Next.js app be built" — obviously it can.)

**Kill-test (cheapest falsifiable check — run in Phase 0, before scaffolding):**
Stand up the minimum path for a guest to watch: a public, view-only room-token
endpoint + a bare LiveKit viewer, and confirm a signed-out visitor can obtain a
valid **view-only** token for a LIVE room (and that non-live rooms leak nothing).
If that fails, the funnel is impossible — stop before building the app.

**Result (evidence — numbers, links, output):**
PASSED in Phase 0 (AfriStage **PR #192**, merged `3125f40`). Public
`POST /live-rooms/:id/guest-token` was built + live-verified against the compose
stack: the minted token decodes to `{ roomJoin:true, canPublish:false,
canSubscribe:true }` with an anonymous `guest_<uuid>` identity (no auth, no
participant row), and an **ENDED room is rejected** (no token leak). 100% coverage
on both changed API files; full suite 768. A signed-out visitor can get a valid
view-only play token — the linchpin holds.

Residual (the *conversion* half, tested continuously by the MVP, not a blocker to
build): actual in-browser video playback needs a live publisher (Phase-1 visual
check), and watch→signup→buy→gift conversion is what the MVP measures in use.

**Status:** PASS

<!--
Rule 0 (doctrine: The Premise Gate): NO infrastructure until Status: PASS.
  - PASS  = the kill-test ran and the premise survived, with evidence above.
  - FAIL  = STOP. Do not build. A cheap early kill is the best outcome short of a real edge.
-->
