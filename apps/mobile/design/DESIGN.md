# AfriStage Mobile — Replication Spec (from design/ mockups)

Studied screen-by-screen from `feed, room, profile.png`, `GoLive$missionControl.png`,
`livestge&admin.png`. This is the source of truth for matching the interfaces.

## Tokens (existing `AfriColors` already match)
- bg `#07070A` · surface `#0E0E13` · elevated `#17171F` · border `#242433`
- orange `#FF8A1F` · gold `#FFC857` · purple `#7C3AED` · teal `#14B8A6`
- success `#22C55E` · danger `#EF4444`
- text `#FAFAFA` · secondary `#D4D4D8` · muted `#A1A1AA`
- Font: **Avenir Next** with the platform sans fallback — applied app-wide without a runtime font download.
- Subtle warm/purple radial glow behind dark backgrounds.

## Badges (IMPORTANT — two distinct pills)
- **Hero** featured card → **RED** `● Live now` pill.
- **Live cards + room tags** → **TEAL** `LIVE` pill.  ← cards/room are teal, not red.
- Viewer pill → **person icon** `👤 1.2K` (not an eye).

## Screen 1 — Feed
- App bar: logomark + **"AfriStage"** wordmark (left); **bell, then search** (right). No coin pill in the pure mockup (coin pill is an acceptable addition).
- **Hero** (full-width, ~248h): red `Live now` + person pill; title (24, w900); `With <creator>`; **gold "Join now →"** button; **carousel dots** bottom-right.
- **"Live now"** header + **"See all"**. Horizontal rail of cards: cover photo + teal LIVE + person pill; below card → **title (bold)** then **creator + flag + country** ("Kofi Blaze 🇬🇭 GH").
- **"Browse by category"** pills: **Music · Talk · Comedy · Dance · Art · Lifestyle** (Music selected = gold).
- **"Creators to watch"** + "See all": circular avatars (gold/gradient ring) + name + person count.
- Bottom nav: **Home · Live · Go Live(center gold circle) · Activity · Profile**.

## Screen 2 — Live room
- Full-bleed creator video/photo.
- Top: down-chevron · frosted creator chip (`Name ✓`) · **purple "Follow" pill** · `👤 3.2K` · `⋯`.
- Tag row: **teal LIVE · 🎵 Music · EN ▾**.
- Chat overlay rows: small avatar + **per-name colored username** + message; **gift line** ("X sent Rose 🌹 x5") = **purple highlight pill**. Floating ❤️ on the right.
- Input: "Say something…" + emoji + share.
- **Send Gift drawer** (4-col, emoji icons): Rose🌹10 · Fire🔥50 · Golden Mic🎤100 · Drum🥁200 · Crown👑500 · Spotlight💡1,000 · Star⭐2,000 · Stage🎭5,000. Selected = purple border. Header has `🪙 balance`.

## Screen 3 — Creator dashboard (pushed screen)
- Top: back · settings · bell.
- Header: purple-ringed avatar · "Welcome back, / **Name ✓** / Creator dashboard".
- Green banner: ✓ "You're approved to go live / All set!…" + green check.
- **Overview** + "This week ▾" → **2×2 grid**: Earnings **$1,245.60** (emphasis), Views 24.6K, New followers 1.2K, Live sessions 8.
- **Earnings** + "See all": card → "Available balance / **$620.40**" + **gold "↑ Payout"** + green "Ready to withdraw" pill.
- **Top supporters** + "This week": rows avatar · name · **$ amount** (right).
- **Purple full-width "(•)) Go Live"** button.

## Screen 4 — Wallet
- "Wallet" (left) · "Support" (right).
- Balance card (dark-gold): "Available balance / **$620.40**" + `USD ▾` + **gold Payout** + **Transactions**.
- **Earnings summary** + "This month": 4 figures — Total $2,340.75 (green) · Views $180.45 · Gift $2,120.30 · Tips $40.00. (Note: Views/Tips not yet tracked server-side.)
- Menu list (icon · title · subtitle · ›): Profile · Payout methods · Live history · Support · Report · Settings.

## Status vs current build
Done: teal/person pills, red hero "Live now" + Join + dots, flag/country cards, categories,
room cover+frosted top bar+purple Follow+tags+chat rows+4-col emoji gifts, USD wallet/dashboard,
nav tabs, Plus Jakarta Sans.
Watch: keep `AfriLivePill` **teal** (cards/room); only the hero uses red `AfriLiveNowPill`.
