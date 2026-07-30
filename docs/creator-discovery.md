# Creator discovery — ten conversations

The waitlist is empty. That is not evidence nobody wants AfriStage; it is
evidence nobody has been asked. This is the script for asking, and the rule for
deciding afterwards.

It is deliberately not a demo. You have built a lot and the urge to show it is
strong — but a demo turns discovery into a pitch, and people are nice to you
during pitches. The link comes at the end, and only if they have already told
you the problem is real.

**Time cost:** ten conversations, ~10 minutes each, plus the DMs. One afternoon.

---

## Who to talk to

Not "creators". People **already live-streaming and already receiving money for
it**. That behaviour is the premise — you are testing whether it *moves*, not
whether it exists.

In order of how much they will teach you:

| Who | Why them |
|---|---|
| Nigerians already earning on **Bigo Live / Likee** | They have proven someone pays to watch them. Hardest sell, which is exactly why they carry the real objection. |
| **TikTok Live** regulars in Lagos, 3+ streams a week | Gifting is native there; the mental model already exists. |
| **Instagram Live** musicians, comedians, DJs with a WhatsApp broadcast list | They can *summon* an audience — the thing that decides whether a scheduled session works. |
| **Church and community broadcasters** | Underrated. Already stream to a fixed weekly slot, already handle money from their audience. |

Find them by watching TikTok Live in the Lagos evening slot (**19:00–22:00 WAT**)
for a week. Whoever is live three nights running has the habit. The habit is
what you need; the follower count is not.

---

## The opening message

Short, specific, no pitch. It must survive being read on a phone in a notification
shade.

> Hi [name] — caught your live on [day], the bit about [specific thing they said].
>
> Not selling anything: what do you actually make from a live these days? I'm
> building something for Nigerian creators and I'd rather hear what's broken than
> guess at it.
>
> 5 minutes, here or on a call — whichever is easier.

**Why it works:** the specific detail proves you watched. "Not selling anything"
is true and disarms the reflex. The question is about *them*, and it is
answerable in one line.

Two variants:

**Warmer (someone you have any connection to):**
> [name] — [mutual] mentioned you stream regularly. I'm building a live app for
> Nigerian creators and I'm trying to talk to ten people who actually do this
> before I build any more of it. Can I ask you two questions about your last
> stream?

**Church / community:**
> Good afternoon — I saw [church/group] streams on [day]. I'm working on a live
> platform built for Nigerian audiences and I'd value 10 minutes with whoever
> runs your stream. I'm not selling anything; I'm trying to understand what the
> current setup costs you.

---

## The six questions

Ask in this order. Questions 1–5 are about **what already happened** — memory is
reliable, intentions are not. Do not skip ahead to the ask.

**1. When was your last live, and how long were you on?**
Warm-up, and it establishes whether they actually have the habit or streamed once
in March.

**2. What did you earn from it — and on which app?**
*The premise question.* Then stop talking. Let the silence do the work.
It tells you three things at once: whether anyone pays them, who your real
competitor is, and what number your offer has to beat.

**3. How do your viewers know you're going live?**
The audience-summoning question. Someone with a WhatsApp broadcast list can fill
a scheduled slot; someone relying on the algorithm cannot. This decides whether
your first session has anyone in it.

**4. Last time money reached your bank — how long did that take, and what did you
have to do?**
The payout question. Nigerian creators on foreign platforms routinely wait, lose
value on conversion, or need an agent. If a specific pain shows up in most
conversations, that is your wedge — and it may matter more than the streaming.

**5. What's the most annoying part of streaming on [their platform]?**
Open, unled, no options offered. Whatever they say first is what actually hurts.

**6. The ask — and it is a date, not a question about interest:**
> I'd like you to do one 30-minute stream on ours this week. Thursday or Saturday?

Offer two named days. "Which day" is a far easier yes than "would you", and it is
the only answer that means anything.

---

## Do not say

- ❌ "Would you use an app where fans send you gifts?" — free to say yes, tells you nothing.
- ❌ "We take a lower cut than Bigo" — you are negotiating before you know they want it.
- ❌ Anything about the ledger, the payout state machine, or the architecture.
- ❌ "It's still in beta, so..." — pre-apologising invites a soft no.
- ❌ Sending the link before question 6.

---

## Record every conversation

Vibes do not aggregate. Ten conversations must produce a decision, so write down
the same seven things each time — one row, immediately after, while it is fresh.

| Name | Platform | Earned last stream | Payout wait | How they summon viewers | Top complaint (their words) | Committed date? |
|---|---|---|---|---|---|---|
| | | | | | | |

Quote the complaint **verbatim**. Your paraphrase will drift towards what you
already believe.

---

## The decision rule — write it down before you start

Deciding the threshold afterwards is how a "no" gets talked into a "maybe".

| Outcome after 10 real conversations | What it means | What to do |
|---|---|---|
| **≥2 firm dates** | You have a beta cohort | Turn on `BETA_AUTO_APPROVE_CREATORS`, schedule the sessions, run the pre-flight (`npm run preflight:live-session`) an hour before each |
| **0–1 dates, but the same payout pain in most conversations** | The streaming is not the wedge — the money movement is | Stop building streaming features. The product is the payout rail. |
| **0–1 dates, no consistent pain** | The premise does not hold with this segment | Try one different segment (diaspora audiences, a single category, a church slot). If that also returns zero, stop. |

Ten polite "sounds great, send me the link" replies with no dates is a **zero**,
not a maybe. That is the most likely trap, and naming it now is the only defence
against rationalising it later.

---

## Afterwards

Whatever the answer, put it in `FEATURE_TRACKER.md` with the actual quotes. A
premise that fails cheaply is a good outcome — the expensive version is finding
out after another quarter of engineering. That is precisely the mistake Rule 0
exists to prevent.
