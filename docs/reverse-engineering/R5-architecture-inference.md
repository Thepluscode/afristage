# Phase R5 — Architecture Inference

Final reverse-engineering phase. Infers the system architecture a BIGO-style
platform requires, and specifies it **against AfriStage's actual stack** — what
ships today, and where it must evolve to scale. Grounded in source, not diagrams
of an imagined system.

**Stack (docker-compose):** Postgres · Redis · LiveKit · MinIO · NestJS API (+ Next.js admin-web, Flutter mobile).
Legend: **LIVE** (built) · **SCALE** (built, has a known ceiling) · **GAP** (to build).

Invariant carried from R1–R4: **the ledger is the single source of financial
truth; every feature is an overlay on it.**

---

## 0. System map

```text
                      Flutter mobile / Next.js admin-web
                                   │  HTTPS + WSS
                    ┌──────────────┴───────────────┐
                    │        NestJS API (Fastify)   │
   ┌────────────────┼───────────────┬───────────────┼──────────────┐
   │ REST (tRPC-ish)│ WS Gateway     │ LiveKit token │ presign      │
   │ auth/creators/ │ (Socket.IO)    │ issuance      │ (MinIO)      │
   │ wallet/payouts │ chat + events  │               │              │
   └──────┬─────────┴───────┬────────┴──────┬────────┴──────┬───────┘
          │                 │               │               │
     ┌────▼────┐       ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
     │ Postgres│       │  Redis  │     │ LiveKit │     │  MinIO  │
     │ (Prisma)│       │(pub/sub,│     │  (SFU)  │     │ (assets)│
     │  LEDGER │       │ cache,  │     │ media   │     │ gifts/  │
     │  = SoT  │       │ rate)   │     │ fan-out │     │ uploads │
     └─────────┘       └─────────┘     └─────────┘     └─────────┘
```

Media never touches the API (LiveKit SFU handles it); the API is control-plane +
money + realtime signalling only. This split is what keeps a mid-range-Android /
unstable-mobile-data audience viable.

---

## 1. Streaming architecture (LIVE)

**Requirement (from BIGO mechanics):** one publisher → many viewers, low latency,
graceful on flaky mobile networks; multi-guest later.

**AfriStage today:** **LiveKit SFU**. On `POST /live-rooms/:id/start` the API mints
a scoped `AccessToken` (`livekit-server-sdk`) — host `canPublish:true`, viewers
`canPublish:false` — for room `afristage-<roomId>`, and returns `{token, url}`.
The client connects **directly to LiveKit**; the API is not in the media path.

```text
host → API /start → LiveKit token (publish) → publishes to SFU
viewer → API /:id/join-token → LiveKit token (subscribe) → SFU fan-out
```

**Why SFU (not mesh/MCU):** an SFU forwards each publisher's stream to N viewers
without re-encoding — cheapest path for 1→many on constrained bandwidth, and it
scales viewers horizontally per LiveKit node.

**Africa constraints handled:** subscribe-only viewer tokens (no upstream needed);
LiveKit simulcast/adaptive layers suit mid-range Android + variable data.

**SCALE / GAP:** multi-guest (audio seats → video grid) is a *token grant* change
(`canPublish` for guest identities) + seat state — no new media infra. Recording/
clips (P3) = LiveKit egress → MinIO.

---

## 2. Realtime chat architecture (LIVE → SCALE)

**Requirement:** low-latency room chat + moderation events (mute/delete) + presence
+ watch-time, cheap on data.

**AfriStage today:** a **NestJS WebSocket Gateway** (Socket.IO) with `emitToRoom`.
Messages persist to Postgres (`GET /live-rooms/:id/messages` for history) and
broadcast live; moderation actions emit `user.muted` / `chat.deleted`; watch-time
is tracked on the gateway. Two-tier: **durable** (Postgres history) + **ephemeral**
(socket broadcast).

```text
client ⇄ WS Gateway ── emitToRoom(roomId, event) ──▶ room subscribers
                    └─ persist message ─▶ Postgres (history/audit)
```

**SCALE ceiling (flagged):** a single-process Socket.IO server only fans out to
sockets on *that* instance. Multi-instance requires the **Socket.IO Redis
adapter** (Redis is already in the stack and health-gated) so `emitToRoom` fans
out across API replicas. This is the one change needed before horizontal API
scaling of chat — infra already present, adapter wiring is the work.

**Africa constraints:** text-first, tiny payloads; degrade to HTTP long-poll where
WSS is blocked; server-side mute keeps moderation cheap.

---

## 3. Wallet / ledger architecture (LIVE — the crown jewel)

**Requirement:** every coin move correct, atomic, non-mintable, auditable.

**AfriStage today (`ledger.service.record`):** a general double-entry poster that,
before writing, enforces:

```text
- ≥ 2 entries, single currency, Σdebits == Σcredits   (balanced or reject)
- inside prisma.$transaction:
    · recompute each guarded account's balance from its entries
    · reject if any nonNegative account would go negative
      (prevents overdraft = prevents minting spendable value)
- then write the transaction + entries atomically
```

Accounts: per-user `COIN / EARNING / PAYOUT_HOLD` + system
`PLATFORM_REVENUE / PAYMENT_CLEARING / PAYOUT_CLEARING`. Every money event
(coin purchase, gift 60/40 split, payout hold/settle, refund) is one balanced
transaction. Admin `ledger-integrity` re-verifies the whole book and **blocks
payouts** on imbalance.

```text
gift send = ONE txn:
  viewer COIN  −total
  creator EARNING +0.6·total
  platform REVENUE +0.4·total      (Σ debit == Σ credit)
```

**SCALE ceiling (flagged, grounded):** balance is recomputed by summing **all** of
an account's entries inside each posting transaction — O(entries/account) per
write. Fine at beta volume; at scale a hot creator's `EARNING` account grows
unbounded and every gift re-sums it. Upgrade path: **materialised running balance
per account** (updated in the same tx) or periodic balance snapshots + delta —
same double-entry invariants, O(1) posting. This is the single most important
architectural scaling item because it sits on the hottest path (gifting).

**Africa relevance:** BigInt minor-unit money (no floats), currency snapshot at
payout, idempotent credit (webhook + verify) — correct across retries on flaky
networks.

---

## 4. Recommendation architecture (LIVE — explainable, not ML)

**Requirement:** relevant, local, "hot" discovery without an ML platform.

**AfriStage today:** `ranking.ts` — an **explainable weighted score** over
peak viewers, recency, and a 10-min gift-velocity window; `country`/`category`
are hard filters, `viewerLanguage`/`viewerCountry` soft boosts; the score
breakdown is returned so feed order is auditable.

```text
feed order = w1·viewers + w2·recency + w3·gift_velocity  (+ locale boosts)
             filtered by country/category
```

**Why not ML (yet):** explainable weights are debuggable, cheap, and fair to new
creators (no cold-start black box). **SCALE/GAP:** compute is per-request today;
at volume, materialise the ranked feed per (country,category) on a short interval
(Redis cache). ML personalisation is R-future, and should sit *behind* the same
scoring interface so it stays explainable/overridable.

---

## 5. Moderation + fraud architecture (LIVE)

**Requirement:** safety at content-time and money-time.

**AfriStage today:**
- **Content/user:** reports → priority queue → admin actions (REVIEWING/ESCALATE/
  DISMISS/ACTIONED/SUSPEND_USER/SUSPEND_ROOM) → user suspend/ban → **audit log**.
  Realtime enforcement via chat gateway (`user.muted`, `chat.deleted`).
- **Money:** a **fraud scorer** — weighted explainable factors → risk 0..1 →
  `recommendedAction`; ≥ 0.6 ⇒ `PAYOUT_HOLD`. Surfaced on the payout row so a
  reviewer sees *why*. Payout approval is also gated on ledger integrity.

```text
report → queue(priority) → action → audit
payout → fraud.score(creator) → {NONE|FLAG|MANUAL_REVIEW|PAYOUT_HOLD} → admin
```

**GAP (from R4):** the scorer is **per-creator**; collective flows (circles,
agencies, event prizes) need **group-aggregate** signals (circle velocity,
member overlap, circular-gifting). Architecturally: keep the scorer a pure
function of features, add group features, run it async/streaming at scale (today
it's on-demand per payout, which is fine now).

---

## 6. Event / ranking (aggregation) architecture (GAP)

**Requirement:** leaderboards, event scores, circle points, mission progress —
all *reads* over gift/ledger data.

**Target:** a single **aggregation service** (materialised views / cron jobs):

```text
Aggregate(subject, scope, window) = Σ GiftTransaction.totalCoinAmount   (settled only)
  subject ∈ {creator, supporter, circle}
  scope   ∈ {city, country, category, event, global}
  window  ∈ {daily, weekly, all-time}
→ materialise to a rankings table; serve from cache
```

One engine backs leaderboards (R4 §3), events (§7), circle points (§7), and
mission progress (§4) — no per-feature bespoke counting, and it reads **settled**
ledger rows so reversible spend can't game ranks. Cost control: precompute per
window, not per request.

---

## 7. Agency / creator relationship architecture (GAP — P3)

**Requirement:** third parties manage creators for commission, auditable.

**Target:** a **relationship + split-leg** model — no new money path:

```text
Agency(profile, KYC) ── manages ──▶ Creator
on a managed creator's EARNING credit, add a THIRD ledger leg:
  creator EARNING  +0.6·total − commission
  agency  EARNING  +commission        (bps configurable)
  platform REVENUE +0.4·total
→ still one balanced transaction; commission visible in ledger-integrity + audit
```

The same double-entry that protects creators protects against off-book agency
skimming. Admin controls (onboard/vet/suspend/commission-config) extend the
existing admin-web pattern.

---

## 8. Cross-cutting concerns

| Concern | AfriStage today | Scale note |
| --- | --- | --- |
| **Auth** | JWT access (15m) + refresh (30d), tokenVersion revocation; admin session refresh (R-gap fix) | stateless; add device-session table before public beta |
| **Rate limiting** | `@Throttle` on auth (10/min) | move to Redis-backed throttler for multi-instance |
| **Object storage** | MinIO presigned PUT (gift animations, uploads) | S3-compatible → swap to cloud S3/GCS in prod |
| **Health** | readiness gates on Postgres **and** Redis | Redis is a hard dependency — provision HA |
| **Idempotency** | coin credit (webhook+verify), gift send (nonce) | keep every money mutation idempotent |
| **Observability** | audit logs, explainable fraud/ranking, ledger-integrity | add metrics/tracing on gift + payout paths |

---

## 9. Scale ceilings, ranked (the honest list)

```text
1. Ledger balance recompute per post   → materialise running balances (hottest path)
2. Single-process Socket.IO fan-out    → Redis adapter for multi-instance chat
3. Per-request feed ranking            → cache/materialise ranked feed per region
4. On-demand fraud scoring             → async/streaming + group features
5. Per-feature counting                → one aggregation engine (settled ledger)
6. Auth revocation granularity         → device-session table
```

None blocks closed beta (current scale). Each has a clear, ledger-preserving
upgrade path, and none requires re-architecting the money spine.

---

## 10. Series conclusion (R1 → R5)

The reverse-engineering series lands on one architecture thesis:

```text
BIGO's product is a dozen features over ONE economic core.
AfriStage already ships that core, correctly:
  - SFU media (LiveKit)          — bandwidth-cheap 1→many
  - Socket.IO signalling         — realtime chat + moderation
  - double-entry ledger          — the single source of financial truth
  - explainable ranking + fraud  — debuggable discovery + safety
Every remaining feature (battles, circles, agencies, events, missions,
leaderboards, subscriptions) is an AGGREGATION / RELATIONSHIP / VISIBILITY overlay
on that core — with exactly two real-money touches to watch (mission-reward promo
funding; recurring subscriptions) and one scaling item on the hot path (ledger
balance materialisation).

Build order stays: core loop (done) → discovery/leaderboards → missions/events →
circles (after group-fraud) → agencies → subscriptions.
```

The moat is not the surface — it's the **auditable ledger + explainable safety**
that lets African creators get paid reliably. Protect that invariant and every
overlay above is incremental.
