# AfriStage — Product Context

Strategic context for design work. Answers who / what / why. Visual answers live
in [DESIGN.md](DESIGN.md).

## Register

**Product.** Design serves the product, not the other way round. The surfaces
that matter are app UI: the live room, the wallet, the creator hub, the shop,
and the admin console. `apps/landing` is the one brand surface and is the
exception, not the model.

## What it is

An African live-streaming platform where creators broadcast, viewers support
them with coins, and — as of the marketplace — creators sell physical and
digital goods to the audience they already have, mid-stream.

Money is the product, not a feature bolted onto it. Coins are bought with fiat,
spent on gifts and purchases, land in a creator's earnings, and leave through a
payout. Every one of those movements is a double-entry ledger post. The design
consequence: **balances, prices and earnings are first-class UI, not metadata.**

## Users

- **Viewers** — mostly Nigeria-first, plus diaspora. On mobile, frequently on
  constrained data (the app ships a low-data mode). They are here to watch
  someone they like and, at the right moment, spend money on them.
- **Creators** — performers, comedians, musicians, faith and football talkers.
  They earn from gifts, and now from a shop. They run the room themselves while
  performing, so host controls compete with their actual attention.
- **Admins / reviewers** — approve creators, approve shops, review payouts and
  reports. Internal, high-volume, consistency beats novelty.

## Purpose

Let an African creator make a living from an audience that is already watching,
without that audience having to leave the app to pay them.

## Brand personality

Warm, loud, celebratory, money-visible.

Money-visible is the load-bearing one. Coin balances, gift values, earnings and
prices are shown plainly and often, in gold. A design that hides the money to
look calm is working against the product.

## Anti-references

What this must **not** look like:

- **Not Western SaaS or fintech.** No navy-and-gold corporate restraint, no
  dashboard minimalism, no enterprise calm. This is entertainment.
- **Not a TikTok or BIGO clone.** The interaction model is deliberately similar
  (vertical live, gifts, pinned products). The identity must not be. A viewer
  should not be able to mistake a screenshot for either.
- **Not generic dark-mode-app.** Near-black plus a purple accent is the
  saturated default of every streaming, crypto and AI product. AfriStage is dark
  because a live video stage is dark, and its accent is warm, not violet.
- **Not loud or cluttered stream UI.** Loud in personality, not in overlay
  density. The video is the subject; badges, banners and animations that bury it
  are a failure even when each one is individually justified.

## Strategic design principles

1. **The stage is the subject.** Every overlay earns its pixels against the
   video underneath. When in doubt, the control gets smaller or moves off-stage.
2. **Money is legible.** Anything that costs or earns states its number in gold,
   without hunting. A price the viewer has to look for is a sale lost.
3. **Warmth carries the brand, not decoration.** Orange and gold do the work.
   Gradients, glass and glow are not the identity.
4. **The host is performing.** Creator controls must survive divided attention:
   large targets, few steps, no dialog chains during a live stream.
5. **Constrained data is the normal case.** Low-data mode is a first-class path,
   not a degraded one.

## Register-specific notes

- Both light and dark are **not** required. The product commits to dark; the
  stage is a dark room.
- Accessibility floor: text ≥4.5:1 on its own surface. The muted grey
  (`#A1A1AA`) on elevated surfaces is the recurring risk and must be checked
  rather than assumed.
