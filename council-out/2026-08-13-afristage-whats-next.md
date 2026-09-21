# Council — AfriStage: what's next

**Date:** 2026-08-13
**Status:** 5/5 advisors delivered. **0/5 reviewers delivered** — all five blind
reviewers failed with `You've hit your session limit · resets 9:30am
(Europe/London)`. The peer-review round did not run. The "what they all missed"
section below is therefore **the chairman's own analysis, not a synthesis of
reviewer votes**, and is weaker for it. Re-run the review round after the reset
to test the verdict adversarially.

⛔ **VERDICT CORRECTED 2026-08-13, after the gating check was run against the
code.** The council shipped with *"sell goods, not coins."* The marketplace turns
out to be priced and settled **in coins**, which fires the stated kill-condition
and refutes the chairman's headline synthesis. The corrected verdict is **sell
coins first, on Paystack, this month.** The original reasoning is left standing
below and marked, not deleted — see "Gating check" and "Chairman synthesis
(corrected)".

---

## Briefing (issued verbatim to all five advisors)

**QUESTION:** What is the highest-leverage NEXT investment in AfriStage — the
single thing to pour the next 2-4 weeks into?

**OPTIONS:**
- (a) Background-jobs infrastructure — no queue/worker; payouts, refunds, emails run inline on the API request thread.
- (b) Beta-wave expansion — invite real creators/viewers; ops docs and launch gates exist.
- (c) Native store release — Android signing wired and verified, fastlane scaffolded, blocked on owner-gated store accounts; hosted Flutter-web build is the interim channel.
- (d) Revenue push — first real paying users; money loop proven end-to-end against real Stripe in test mode.

**LOAD-BEARING FACTS:**
1. Live-streaming + gifting platform (BIGO-style): NestJS/Prisma API, Flutter mobile, Next.js admin/web, Railway staging. Creator marketplace / live shopping merged ~2 weeks ago.
2. Money loop VERIFIED against real Stripe (test mode): card → coins → balanced double-entry ledger; webhook replay idempotent. **Paystack (the Africa-market provider) is UNREHEARSED — no test key.**
3. Hardening just completed: correlation IDs on every response incl. rejected; DB-level double-entry constraint; ledger integrity swept every 5 min; Slack paging live and drilled. ~1020 unit tests green; live E2E suites in CI.
4. Solo builder. Doctrine: Premise Gate — a paid product's premise is "someone pays", tested with the cheapest falsifiable check before infrastructure. **Nobody has paid yet. Zero revenue.**
5. No queue/worker anywhere in the API (verified by search). Beta scale tiny (staging: 13 ledger transactions).
6. Closed-beta ops docs, seeded accounts, launch gates exist and are exercised. Native distribution needs founder-created Play Console account + upload keystore; emulator can't test camera publish.

---

## Letter map (kept private during review; reviewers saw only A–E)

| Letter | Advisor |
|---|---|
| A | Outsider |
| B | Executor |
| C | First-Principles Thinker |
| D | Contrarian |
| E | Expansionist |

---

## Advisor arguments (full text)

### A — Outsider · verdict (d), on the rail customers actually have

The headline number is 1020 tests and zero dollars. Nothing in the briefing tells me a single human outside the founder has ever wanted this product. Thirteen ledger transactions in staging is not a beta, it's a demo. Every fact offered as evidence of progress is a fact about the *inside* of the system — correlation IDs, a database constraint, a five-minute integrity sweep, Slack paging that was drilled. Not one is a fact about a person. A stranger reads that list and concludes: this team is extremely good at building, and has not yet found out whether anyone wants it.

The Stripe/Paystack thing is the tell, and it is bigger than it looks. The product is for African creators. The payment rail rehearsed end-to-end, with real cards, with idempotent webhook replay, is Stripe. The rail your actual users would pay through — Paystack — has *no test key*. So the "VERIFIED money loop" is verified for a customer who doesn't exist. That is the curse of knowledge in its purest form: from the inside it reads "money loop: done." From the outside it reads "we have proven we can charge Americans." If the first real Nigerian card fails, every hour spent on queues, stores, or beta invites was spent on top of an untested premise. Wiring Paystack and taking one real ₦ from one real person is the cheapest falsifiable check available, and it is currently not done.

A streaming app nobody can install is a serious signal — but not the one to chase now. Yes, "download our app" resolving to a hosted Flutter-web build is strange, and creators will notice. But store review takes weeks of calendar time you don't control, it's blocked on accounts only the founder can create, and camera publish can't even be tested without a physical device. Do not spend the next month waiting on Apple to tell you whether anyone would have paid.

Background jobs is the easiest option to justify and the worst one to pick. It is real engineering, it is genuinely missing, and at thirteen transactions it is a solution to a problem you have never had. Inline emails at this scale are not a defect; they're correct sizing. Build the queue the week something times out.

**On the record:** *the money loop is not verified until money has moved on Paystack from a real African card into a real creator's balance and out again.* Until that happens, "the money loop is proven" is a sentence about Stripe, and every roadmap built on it is built on a rail your market doesn't use. Test that in week one. If it works, invite creators. If it doesn't, you just saved yourself a quarter.

### B — Executor · verdict (d), because it starts clocks you don't control

It is the only option whose first action starts a clock the founder does not control — and clocks you don't control are the ones you start Monday.

**Mon 09:00 (founder-gated, ~60 min):** Submit Stripe live-mode activation *and* open the Paystack account — CAC registration number, BVN, settlement bank account. Nobody else can do this; it is identity paperwork. Paystack hands over **test keys immediately** on signup; live keys wait on business verification (days, not hours, but the queue only moves if you're in it).

**Mon 14:00 (2-3 days of build):** Paystack is the one UNREHEARSED leg of a money loop that is otherwise VERIFIED. With test keys in hand by lunchtime, wire Paystack behind the existing provider seam and run the same E2E that already proves card → coins → balanced ledger. Evidence back **Wednesday**: either Paystack's webhook replay is idempotent under your existing suite, or it isn't. That is a real outcome either way.

**Tue 09:00 (30 min, then forget it):** File the Play Console account anyway. Not as the focus — as a background clock. Identity verification plus the closed-testing window means submitting three weeks from now costs you three weeks. Submitting Tuesday costs 30 minutes. Option (c) is a *paperwork errand*, not a 2-4 week investment; treating it as the main effort is how a founder spends a month waiting for Google.

**Wed–Thu:** Price coin packages in NGN. Put a live Buy button on the hosted Flutter-web build — the channel that already exists.

**Fri (founder-gated, unglamorous):** DM 15 creators individually. Not "join our beta." Ask them to buy the smallest coin pack. **Evidence lands within 10 days: N cards charged, or zero.** Both answers are worth more than anything else on this list.

**Why not the others:** (b) has a genuine first action — recruiting is real work only the founder can do — but with no live payment path it returns engagement numbers, and engagement numbers are the purest form of activity-dressed-as-progress. Note also you'd be inviting creators to a channel where camera publish has never been tested on a physical handset; that's a demo that fails in front of the exact people you were trying to impress. (a) has the *easiest* Monday morning of all four — `npm install bullmq`, no gate, no human, no waiting — which is precisely the tell. At 13 ledger transactions there is no queue pressure to relieve. Its evidence is "the worker drains," which answers a question nobody asked.

**On the record:** the background-jobs option is the only one with zero founder-gated latency, and that is not a point in its favour — it is the reason it will feel productive while every clock that matters stays unstarted. Paystack KYC and Play Console verification are things the calendar does *to* you. Start them Monday, or pay for them in December.

### C — First-Principles · verdict: reframe to creator recruitment

None of the four, as framed. The next 2-4 weeks is a creator-recruitment operation, not an engineering investment — and its one engineering dependency is Paystack in production, not any of (a), (b), (c) or (d) as written.

Strip it down. What does the founder actually want? Evidence that this thing can make money. Every option is a proxy for that, and three of the four are proxies for a proxy.

Now strip the product. In live-gifting economics, nobody pays for the app. Viewers don't arrive for AfriStage; they arrive for a specific person, and a small number of them pay to be *noticed* by that person in front of an audience. The platform is a payment rail with a leaderboard bolted on. That means the unit of value is not a feature and not a user — it's **a creator who can drag an existing audience across a platform switch.** Everything else is plumbing behind that one asset.

So the premise on the Premise Gate is being misread. "Someone pays" is the *generic* paid-product premise. AfriStage's actual premise is narrower and harsher: **"a creator with an existing audience will move some of it onto our app, and that audience will pay there."** Nobody has tested it. It is testable in a week, and it requires zero code. One creator, 5-50k followers, one scheduled live session, a WhatsApp group, and a payment link. If her audience won't pay her on the cheapest possible rail, they will not pay her through a beautifully instrumented double-entry ledger.

Which exposes the thing I most want on the record. **The verified money loop is verified in the wrong currency, on the wrong rail, for the wrong customer.** Stripe test-mode with real cards proves a Western card flow. Paystack — the rail the actual market pays on — is unrehearsed, no test key. So "the money loop is proven end-to-end" is true of a loop the target user cannot enter. Option (d) reads as a green light and is in fact a red flag: you cannot "push revenue" through a rail you have never run a single transaction on.

Dismissals, fast: (a) is throughput engineering at 13 lifetime ledger transactions — optimizing a queue for a load that does not exist. (c) is opening a distribution channel with nothing to push through it; creating the Play account is a 30-minute errand, not a 3-week investment. (b) is closest to right but is framed as *operating a beta* rather than *recruiting supply*, and beta-ops docs are not creators.

The binding constraint is creator supply, and platform readiness has no dependency on it whatsoever. That is the wrong-variable error: months of hardening moved a number that was never the constraint. Scoreboard for the next four weeks: creators contacted, creators who agreed to stream, sessions held, and naira collected in one session — with the only build task being Paystack live. If no creator will move, the idea is dormant, not dead, and the spending stops.

### D — Contrarian · verdict (d), least-fatal failure mode

How each one fails:

**(a) Background jobs fails by being correct.** Nothing about it is wrong. Payouts should be on a worker. But 13 ledger transactions is not a load problem, it is a rounding error, and the honest description of two weeks spent here is "the API got tidier and the scoreboard stayed at zero." The failure isn't a bug — it's that success is indistinguishable from doing nothing. That is exactly the state the Premise Gate exists to prevent, and this is the fourth consecutive hardening cycle. Correlation IDs, ledger constraints, Slack paging, integrity sweeps — the reflex is now to build the thing you're competent at instead of the thing you're afraid of.

**(b) Beta wave fails by spending an asset you cannot re-buy.** A creator invited to a live-streaming platform gets exactly one first impression, and live streaming is a liquidity problem: a viewer who arrives to an empty room does not return, and a creator broadcasting to zero viewers does not stream twice. You'd be spending the invite list to test whether a hosted Flutter-web build can publish camera from a mobile browser — which is not the question you care about, and on iOS Safari is the one most likely to answer no.

**(c) Native release fails by being blocked on someone who is already the bottleneck.** Owner-gated accounts, store review latency, no physical device for camera publish, and — the part nobody has priced — Apple and Google require in-app purchase for digital goods, and coins for gifting are digital goods. That is 30% off the top, and a Stripe card sheet inside the app is grounds for rejection. Every unit economic implied by the verified money loop is currently wrong for the channel you're building toward.

**(d) Revenue push fails three ways.** Paystack is unrehearsed, so what you'd be testing is whether card-holding diaspora users pay, not whether the African market does. There's no audience, so the coin funnel has no demand event to attach to. And real money in creates a real payout obligation running inline on a request thread with no worker.

Every one of those is survivable at 13 transactions. Manual payouts are fine at single digits. The wrong-market caveat is a labelled result, not a lie. And the failure is cheap and legible: nobody pays, you know in a week, and you've spent a week.

**On the record:** the Stripe-verified money loop is verified for a channel you may never legally use. Before pricing a single coin pack, confirm whether AfriStage's gifting currency falls under Apple's IAP rule. If it does, the 30% cut, not the queue, is the load-bearing unknown — and it changes what "someone pays" has to prove. Test that this week, alongside the first charge. Do not run a free beta wave; make every invite carry a price.

### E — Expansionist · verdict (d) enlarged: first live *sale*, to the diaspora

Everyone in this room is going to argue about which of four boxes to tick. Look at what's sitting outside the boxes.

**The coin economy is the small business you happened to build first.** Viewer gifting is an ARPU-starved model in a market where discretionary spend is thin — you need thousands of viewers each parting with money for nothing tangible. Two weeks ago you shipped a creator marketplace with live shopping. That is *commerce*: real goods, real margin, money that already exists in the buyer's budget rather than money you must conjure. Live commerce is a hundred-billion-dollar behaviour in China and an unbuilt one across Lagos, Nairobi, Accra — where the entire trade already happens badly, on Instagram DMs and WhatsApp voice notes with no ledger, no escrow, no payout. You built the ledger. You just haven't pointed it at the transaction that matters.

**The unnoticed adjacency: Stripe is verified and Paystack is not — so stop treating that as a blocker and read it as a map.** Verified card rails point at the diaspora. A Nigerian in Houston or a Ghanaian in London has a working card, many times the ARPU of a local viewer, and a standing emotional reason to send money home. Live shopping plus diaspora equals *remittance with a product attached* — the buyer in London pays for the goods, the recipient in Lagos receives them, the creator takes the sale. That corridor is worth more than every coin you will ever sell, and it runs on the exact payment provider you have already proven end-to-end.

**And flip who pays.** Testing "someone pays" with viewers is the hardest possible version of the test. Sellers already have money and inventory; they pay for access to buyers. Ten merchants each running one live sale is a cheaper, faster, higher-signal premise test than a thousand viewers browsing a coin shelf.

So the next 2-4 weeks: one merchant, one scheduled live selling event, diaspora audience, Stripe checkout, real GMV through the double-entry ledger, and a payout that lands. That is a Premise-Gate-legal test *and* it opens the 10x lane.

**On the record:** if you run the premise test as "will viewers buy coins," a failure will read as "nobody pays for AfriStage" — and it will be a false negative that kills a live-commerce payments company because its weakest revenue line underperformed. Test the strongest monetization first. The gifting loop is a feature of the marketplace, not the other way around. Everything you hardened — the ledger, the idempotent webhooks, the integrity sweeps — is over-engineered for tipping and exactly right for merchant settlement. You already built the big company. Go sell to it.

---

## Peer review round — DID NOT RUN

Five blind reviewers were spawned with the anonymized A–E set. All five failed:

```
idleReason: failed
failureReason: You've hit your session limit · resets 9:30am (Europe/London)
```

No reviewer votes exist. The strongest/blind-spot/what-all-missed questions were
not answered by anyone but the chairman. **This is the weakest part of this
council and should be re-run.**

---

## Gating check — answered from the code, 2026-08-13

The synthesis below made one claim conditional on a fact nobody in the council
had checked: *is the marketplace order → payment → payout path already
end-to-end verified?* It was made step 3 of Monday morning. It was then run
immediately. The answer refutes the headline verdict.

| Question | Finding | Evidence |
|---|---|---|
| How are marketplace products priced? | **In coins, not currency** | `Product.priceCoins`, `Order.unitPriceCoins / totalCoins / sellerNetCoins / platformFeeCoins` (`prisma/schema.prisma`) |
| Does an order ever touch a payment provider? | **No** | Zero matches for stripe / paystack / checkout / intent across `src/modules/marketplace/` |
| What does a sale actually move? | An internal ledger transfer | `MoneyService.purchase()` debits the buyer's COIN account, credits `sellerEarning` + `platformRevenue` |
| Does `validate:marketplace` prove a cash-out? | **No** | It asserts a creator `EARNING` balance delta and stops; no payout leg |

**The buyer journey is `card → coins → goods`, not `card → goods`.**

### What that refutes

The chairman's "moat-finding" synthesis — *physical goods are IAP-exempt, so
commerce-first also solves the Contrarian's 30% problem* — **does not hold as
built**. Apple's cut is triggered by the digital-goods purchase, and in this
architecture that is still the coin pack. Routing sales through the marketplace
changes what coins are *spent on*; it does not change what the card *buys*.
Making commerce IAP-exempt requires a direct card-checkout path for physical
orders, which does not exist and is new build.

That is exactly the stated kill-condition — *commerce-first means building
before the premise test* — and it fires.

### Two findings beyond the question asked

1. **The coins-first architecture IS the IAP exposure.** Every current route to
   monetization passes through a digital-goods purchase. If native distribution
   matters, a direct card checkout for physical orders is not a nice-to-have —
   it is the thing that makes the marketplace worth 30% more than the gifting
   loop.
2. **The seller cash-out leg is unproven end to end.** `validate:marketplace`
   stops at the seller's EARNING balance; `validate:money` covers *creator*
   payouts. Whether a **shop owner** can withdraw marketplace earnings is
   untested — and "can I get my money out" is the first question any merchant
   asks.

---

## Chairman synthesis (corrected)

### Verdict — CORRECTED

**(d) Revenue push — sell COINS first, on Paystack, this month**, with the
calendar-bound paperwork started Monday and creator recruitment running in
parallel from day one. The commerce test comes immediately after, and the IAP
finding goes on the record for when native distribution lands.

> ⛔ **Superseded.** The verdict as originally issued read: *"run as a live
> commerce sale, not a coin sale."* The gating check above refuted it — the
> marketplace settles in coins, so commerce-first means two weeks of building
> before the premise test. Everything else in this synthesis stands.

Four of five advisors independently landed on (d); the fifth (First-Principles)
reframed to creator recruitment whose *only* engineering dependency is the same
payment work. There is no real dissent about direction. The disagreement is
about **what to sell first** — coins (A, B, D) or goods (E) — and that is the
decision worth making deliberately.

### Why

**1. Four lenses converged on the same defect without coordinating: the money
loop is verified on the wrong rail.** Outsider called it "verified for a
customer who doesn't exist," First-Principles "the wrong currency, on the wrong
rail, for the wrong customer," Contrarian "you'd be testing diaspora cards, not
the African market," Executor "the one UNREHEARSED leg." When four independent
framings name the same fact, that fact is load-bearing. `validate:money` passing
39/39 against Stripe is true and does not mean what the tracker implies it
means.

**2. The reinforcement neither advisor saw — IAP and the marketplace *could*
solve each other, but not as built.** Contrarian's sharpest point is that Apple
and Google require in-app purchase for *digital goods*, and gifting coins are
digital goods: 30% off the top, and a Stripe sheet inside the app is grounds for
rejection. Expansionist's sharpest point is that the marketplace sells *physical
goods*, which are **exempt** from the IAP rule — Amazon, Uber and every commerce
app take card payments in-app without paying Apple a cent.

> ⛔ **Corrected by the gating check.** The exemption requires the buyer to pay
> for *goods* with a card. AfriStage's marketplace is priced in coins and settled
> by internal ledger transfer, so the card still buys a digital good. The
> combination is real but **latent** — it becomes true only once a direct
> card-checkout path for physical orders exists. As a strategic finding it
> survives; as a reason to sell goods *this month* it does not.

The durable half: coins are the revenue line most likely to be taxed 30% at
exactly the moment distribution is solved, and the marketplace is the lane where
that tax can be legally avoided — once it takes card payments directly.

**3. Executor's calendar argument is decisive on sequencing, not on choice.**
Paystack KYC and Play Console verification are clocks the founder does not
control, cost ~90 minutes total to start, and are pure loss if deferred. They
are not "the investment" — they are Monday-morning errands that must happen
regardless of which sale gets tested first.

### The thing they all missed

*Chairman's own analysis — the review round that should have produced this did
not run.*

**Taking real money is the one experiment that creates obligations, and all five
priced it as if it were free.** Every advisor treats "take one real payment" as
the cheapest falsifiable check. Legally it is the most expensive one on the
list, because the moment real money lands:

- **You hold a float.** Coin balances and creator earnings are stored value.
  Holding customer funds and paying them out is regulated activity in Nigeria
  (CBN) and most other target markets; Paystack's own terms restrict operating a
  wallet on top of them. Nobody asked whether AfriStage can legally custody
  balances, and it is the question that arrives *on the same day as the first
  naira*.
- **The reversibility asymmetry is the classic killer of gifting platforms.**
  Card payments are reversible for months; creator payouts are not. Buy coins
  with a stolen card, gift to an accomplice creator, withdraw before the
  chargeback lands — that is the standard attack on this exact business model,
  and the double-entry ledger records it perfectly while doing nothing to stop
  it. Contrarian got closest ("real money creates a real payout obligation") but
  framed it as a queue problem, not a fraud problem.
- **A payout hold is the cheap mitigation for both**, and it costs nothing:
  settle creator earnings on a stated delay (e.g. T+14) for the pilot. That
  preserves the entire premise signal — did they pay? — while removing the float
  exposure and the chargeback window.

None of the five mentioned runway either. The Premise Gate is about when to stop
spending; nobody asked how many months of spending remain.

### One concrete next step

**Monday, in this order:**

1. **09:00 (~60 min, founder-only):** Open the Paystack account (CAC, BVN,
   settlement bank) and submit Stripe live activation. Test keys arrive
   immediately; the verification queue only moves if you're in it.
2. **09:45 (~30 min, founder-only):** File the Play Console account. Background
   clock, not the project.
3. ~~**10:15 (30 min, the gating check):** is the marketplace order → payment →
   payout path already E2E-verified, or only the coin path?~~ **✅ ANSWERED
   2026-08-13 — only the coin path.** The marketplace settles in coins and never
   touches a provider. First real transaction is therefore a **coin pack**; the
   commerce test comes second. That 30 minutes is now free.
4. **Rest of week:** Paystack behind the existing provider seam, same E2E that
   already proves card → coins → ledger. Then price in NGN, put a Buy button on
   the hosted web build, and set creator settlement to a stated T+14 hold.
5. **Friday, non-negotiable:** DM 15 named creators individually and ask for a
   scheduled session date — not a beta signup. Creator supply is the binding
   constraint and it is calendar-bound too.

Scoreboard for four weeks: **creators contacted · creators who agreed to a date ·
sessions held · naira collected · payout landed.** Not tests, not coverage, not
PRs merged.

### Confidence and kill-condition

**Confidence: high on (d), on Monday's sequence, and now on coins-before-goods.**
The direction had 5/5 agreement across genuinely different lenses; the sequencing
argument is arithmetic about calendars; and the coins-first call is no longer a
judgement — it is what the schema says.

**Kill-condition #1 — FIRED, 2026-08-13.** *"If the marketplace's
order→payment→payout path is not already end-to-end verified, commerce-first
means two weeks of building before the premise test."* Checked against the code:
the marketplace is priced in `priceCoins` and settled by internal ledger
transfer, never touching a provider. **Verdict flipped to coins-first.** This is
the kill-condition working exactly as intended — it took 30 minutes and it moved
the answer.

**Kill-condition #2 — still open, and now the most dangerous unknown.** If
custody of user balances requires a licence AfriStage cannot hold, the product is
not "not yet monetized" — it is mis-architected for its market, and the fix is
routing payments creator-direct rather than through a platform wallet. Establish
this before the first naira, not after. Note that coins-first *increases*
exposure here: a coin balance is unambiguously stored value, whereas a
card-per-order commerce flow would hold customer funds only in transit.

**Kill-condition #3 — new, from the gating check.** If a shop owner cannot
actually withdraw marketplace earnings (the cash-out leg is unproven; only
*creator* payouts are covered by `validate:money`), then the marketplace cannot
be sold to merchants at all, and the commerce lane is further away than this
council assumed. Test the seller withdrawal before pitching a single merchant.
