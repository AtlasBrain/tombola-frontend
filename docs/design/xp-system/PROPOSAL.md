# XP / Level System — Product Proposal

> Pre-implementation design. Nothing built yet. Awaiting founder approval on the open questions in §8 before any code lands.

**Goal:** 100-level progression where users evolve from plankton → whale → mythic ocean lord as they engage with Tombola.

---

## 1. Headline design choices

| Decision | Recommendation | Rationale |
|---|---|---|
| Lifetime vs seasonal XP | **Lifetime** | Matches the "evolution" narrative. Seasonal resets break the shrimp-to-whale identity. Seasonal *ranks* can be added later as a parallel system. |
| Visible to others | **Yes, by default · respects `profile.isPublic`** | Status systems only work if peers see them. Privacy-conscious users already opt out via the existing toggle. No new flag needed. |
| Cosmetic vs functional | **Cosmetic only in v1** | Functional perks (e.g. lower fees) would change the protocol's economics and require Anchor changes. Cosmetic is shippable in days; perks can land later if we want them. |
| XP source mix | **40% activity · 30% loyalty · 30% value** | Pure spend = whales auto-win, casuals never level. Pure activity = farming gold rush. Hybrid keeps every cohort progressing. |
| Whale privacy | **Use existing `profile.isPublic` flag** | Private profile = level hidden externally, still visible to self. No separate "hide level" toggle. |
| Anti-farming | **Server-side rate limits + on-chain anchors** | Most XP-earning actions are already gated by signed actions; wins are gated by Anchor. Farming surface is bounded. |

---

## 2. XP curve

Formula:

```
xp_to_next(level) = floor(50 × level ^ 1.4)
total_xp_for_level(N) = Σ xp_to_next(k) for k = 1..N-1
```

**Where the milestones land:**

| Level | XP to next | Cumulative XP | Typical user time |
|---|---|---|---|
| 1 | 50 | 0 | first signup |
| 2 | 132 | 50 | end of first session |
| 5 | 480 | 980 | first day |
| 10 | 1,255 | 5,500 | first week (active) |
| 25 | 4,200 | 38,000 | first month (active) |
| 50 | 9,480 | 165,000 | 3-4 months committed |
| 75 | 16,750 | 425,000 | ~1 year |
| 99 | 24,830 | 940,000 | dedicated long-term |
| 100 | — | ~965,000 | < 0.1% of users |

L100 should feel rare. The curve is steep enough that even daily caps + max activity make it a multi-month effort minimum.

Tuning levers (one variable, exposes the whole curve):
- `base = 50` → smaller value = faster overall progression
- `exponent = 1.4` → larger exponent = harsher endgame

---

## 3. 100-level ocean progression

Six visual tiers, each with its own color + style treatment. The badge for each level is a single SVG; transitions between tiers are visible upgrades (palette shift + animation introduced at high tiers).

### Tier 1 · Plankton & Crustaceans (L1-10) — *entry tier*

Palette: **coral pink + sand** · style: tiny, flat, charming

| L | Name | L | Name |
|---|---|---|---|
| 1 | Plankton | 6 | Mantis Shrimp |
| 2 | Krill | 7 | Tiger Prawn |
| 3 | Brine Shrimp | 8 | Sand Crab |
| 4 | Sea Monkey | 9 | Hermit Crab |
| 5 | Pink Shrimp | 10 | Coral Crab |

### Tier 2 · Small Fish (L11-25) — *casual user*

Palette: **lavender + cyan** · style: simple silhouettes, soft glow

| L | Name | L | Name | L | Name |
|---|---|---|---|---|---|
| 11 | Guppy | 16 | Pufferfish | 21 | Snapper |
| 12 | Goldfish | 17 | Clownfish | 22 | Bass |
| 13 | Anchovy | 18 | Angelfish | 23 | Trout |
| 14 | Sardine | 19 | Lionfish | 24 | Salmon |
| 15 | Herring | 20 | Mackerel | 25 | Pike |

### Tier 3 · Open Ocean (L26-45) — *regular*

Palette: **mint + deep teal** · style: gradient fills, subtle outline glow

| L | Name | L | Name | L | Name | L | Name |
|---|---|---|---|---|---|---|---|
| 26 | Sea Turtle | 31 | Manta Ray | 36 | Lobster | 41 | Tuna |
| 27 | Hawksbill | 32 | Stingray | 37 | Moray Eel | 42 | Bluefin |
| 28 | Octopus | 33 | Eagle Ray | 38 | Barracuda | 43 | Sailfish |
| 29 | Cuttlefish | 34 | Spider Crab | 39 | Swordfish | 44 | Mahi-Mahi |
| 30 | Squid | 35 | King Crab | 40 | Marlin | 45 | Giant Trevally |

### Tier 4 · Predators (L46-65) — *committed*

Palette: **steel blue + cyan accents** · style: sharper edges, soft inner glow

| L | Name | L | Name | L | Name | L | Name |
|---|---|---|---|---|---|---|---|
| 46 | Reef Shark | 51 | Mako | 56 | Goblin Shark | 61 | Spinner Dolphin |
| 47 | Nurse Shark | 52 | Lemon Shark | 57 | Megamouth | 62 | Porpoise |
| 48 | Bull Shark | 53 | Blacktip | 58 | Greenland Shark | 63 | Beluga |
| 49 | Tiger Shark | 54 | Whale Shark | 59 | Dolphin | 64 | Narwhal |
| 50 | Hammerhead | 55 | Great White | 60 | Bottlenose | 65 | Pilot Whale |

### Tier 5 · Whales (L66-85) — *high-value*

Palette: **midnight blue + lavender holographic accents** · style: detailed, subtle particle field around badge

| L | Name | L | Name | L | Name | L | Name |
|---|---|---|---|---|---|---|---|
| 66 | Minke Whale | 71 | Right Whale | 76 | Sperm Whale | 81 | Antarctic Blue |
| 67 | Pygmy Whale | 72 | Bowhead | 77 | Orca | 82 | Megalodon |
| 68 | Beaked Whale | 73 | Fin Whale | 78 | Pod Leader | 83 | Liopleurodon |
| 69 | Sei Whale | 74 | Humpback | 79 | Old Orca | 84 | Helicoprion |
| 70 | Bryde's Whale | 75 | Gray Whale | 80 | Blue Whale | 85 | Dunkleosteus |

### Tier 6 · Mythic (L86-100) — *legendary, < 0.1%*

Palette: **abyssal black + gold + animated mint-to-coral gradient** · style: animated SVG (slow rotation, particle drift, glow pulse)

| L | Name |
|---|---|
| 86 | Sea Serpent |
| 87 | Kraken |
| 88 | Leviathan |
| 89 | Bahamut |
| 90 | Charybdis |
| 91 | Scylla |
| 92 | Tiamat |
| 93 | Jörmungandr |
| 94 | Cetus |
| 95 | Lusca |
| 96 | Aspidochelone |
| 97 | Yacumama |
| 98 | The Behemoth of the Deep |
| 99 | The Old One |
| **100** | **Poseidon's Crown** |

### Naming + rarity conventions

- **Tier name shown next to level** in profile and tooltips: e.g. `Lv. 32 · Stingray · OPEN OCEAN`.
- **Tier transitions are explicit**: crossing into a new tier triggers a bigger level-up moment (modal vs toast).
- **Sub-cosmetic variants**: not in v1, but each badge could later have a "shiny" or "alt" variant for rare events (e.g. winning a mythic-pot draw at low level).

---

## 4. XP earning rules

### Action grants (server-issued, server-verified)

| Action | XP | Cap | Notes |
|---|---|---|---|
| Account creation (first sign-in) | 50 | once | One-time bootstrap |
| Profile completion (pseudo + avatar + X handle) | 100 | once | Encourages full profile |
| First wallet connection | 25 | once | Pairs with signup |
| Daily login (signed action within 24h) | 10 | 1/day | Soft daily incentive |
| 7-day streak | 50 | 1/week | Stacks on daily |
| 30-day streak | 250 | 1/month | Stacks on weekly |
| Buy a ticket | 5 | 50/day | Discourages burst-spam |
| Join a brand-new pool (never participated) | 25 | 100/day | Encourages exploration |
| Create a private pool | 100 | 500/week | Encourages community building |
| Send a friend request | 5 | 20/day | Anti-spam cap |
| Friend request accepted (recipient) | 10 | uncapped | Recipient action — hard to farm |
| Friend redeems your invite to a private pool | 50 | uncapped | Genuine onboarding event |
| Win a pool | 100 | uncapped | On-chain verifiable, can't be faked |
| Win bonus (per 0.001 SOL won) | 1 | uncapped | Diminishing returns vs flat win |
| Spend milestone — 1 SOL lifetime | 250 | once | Loyalty marker |
| Spend milestone — 10 SOL lifetime | 1,000 | once | |
| Spend milestone — 100 SOL lifetime | 5,000 | once | |
| Spend milestone — 1,000 SOL lifetime | 25,000 | once | Whale-tier unlock |
| Refer a new user (signs up + claims profile) | 100 | 50/lifetime | Lifetime cap to prevent referral mills |

### XP source mix at level 50 (typical user)

To reach 165,000 XP (level 50), a hypothetical engaged user breakdown:

- **Activity (40%)** — daily logins + ticket buys + pool joins → ~66K XP
- **Loyalty (30%)** — streaks + spend milestones → ~50K XP
- **Value (30%)** — wins + creator activity → ~50K XP

This balance is tunable — exact percentages set at server-side weights, no schema change needed.

### Anti-farming rules

1. **All XP issued server-side**, never client. Every grant goes through `grantXp()` which validates the action against existing wallet signature or on-chain event.
2. **Per-action daily caps** stored in Redis (`xp-rate:<wallet>:<action>:<YYYY-MM-DD>`) with TTL = end of day UTC. Caps reset cleanly.
3. **Self-friending / cycling**: friend-store already blocks self-edges; multi-wallet cycles are slowed by the recipient-side acceptance requirement (you can't farm by accepting your own requests with a second wallet without paying 2× signing cost).
4. **Multi-wallet farming**: detect via existing risk heuristics (concentrated IP, rapid creation). Surface in admin risk feed. v1 doesn't auto-block — admin can manually freeze XP grants on a wallet.
5. **On-chain anchors**: ticket buys, pool wins, private-pool creation are all verifiable on-chain. Server XP grants for these reference the tx signature so they can't be claimed twice for the same event.
6. **Suspicious-rate flag**: if a wallet earns > 10,000 XP/day, surface in the admin risk feed.
7. **No backfill bonuses for retroactive activity** (or only a small one — see §6).

---

## 5. UX surface

### Where the level appears

| Surface | Treatment |
|---|---|
| `IdentityPill` (header) | Small ring around avatar tinted by tier color · level number in dropdown |
| Profile page (`/u/[handle]`) | Large badge + progress bar + tier label |
| Friend list rows | Small numeric badge next to pseudo |
| Pool participant tables | Small numeric badge next to pseudo |
| Search palette results | Inline pill: `Lv. 47 · Nurse Shark` |
| Leaderboard | New "Top Whales" tab sorted by level |
| Notifications bell | Level-up events |

### Profile page XP bar

```
┌────────────────────────────────────────────────────────────┐
│  🐳  Lv. 47 · Nurse Shark           NEXT: Bull Shark  L48  │
│      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  4,210 / 6,860 XP  ·  61%       │
│      PREDATORS TIER · You're closer to Bull Shark…         │
└────────────────────────────────────────────────────────────┘
```

### Level-up moments

Three intensities:

1. **Toast** (small level-up within a tier): bottom-right corner, ~4s autohide, lavender accent.
2. **Modal** (tier boundary cross — e.g. L25→L26): full-screen overlay with badge animation + "You've entered OPEN OCEAN" headline + Continue button.
3. **Mythic flair** (L86+ entry): same modal but with particle effect + custom audio (optional, off by default).

Notification bell records every level-up so the user can review.

### Level badge in dropdown

```
┌──────────────────────────────────┐
│ @MARWAN                          │
│ A9XZabc…vwxyzCDWY                │
│ 🐬 Lv. 60 · Bottlenose Dolphin   │
│ ▓▓▓▓▓▓▓░░░ 1,890 / 7,640 XP      │
├──────────────────────────────────┤
│ 👤 MY PROFILE                    │
│ 🔍 VIEW ON EXPLORER              │
│ ──                               │
│ 📋 COPY ADDRESS                  │
│ 🔄 SWITCH WALLET                 │
│ 🚪 DISCONNECT                    │
└──────────────────────────────────┘
```

---

## 6. Backfill for existing users

Day 1 of XP launch, existing users wake up to "Level 1 Plankton" — that feels punishing.

**Proposed backfill (one-time, idempotent):**

| Source | XP awarded |
|---|---|
| Profile created (existing `profile.createdAt`) | 50 + 100 + 25 |
| Lifetime tickets bought | 2 XP per ticket (half rate to avoid runaway) |
| Lifetime pools joined | 10 XP per distinct pool |
| Lifetime wins | 50 XP per win + 0.5 XP per 0.001 SOL won |
| Friends accepted | 5 XP per friend |
| Spend milestones | full grant for any milestone already crossed |

Run as admin-gated POST `/api/admin/maintenance/xp-backfill`, idempotent (`xp:backfilled:<wallet>` flag prevents re-run). Returns a summary of who got how much.

After backfill the user lands at a level that reflects their actual contribution — likely L5-30 for active users, L1-3 for tourists.

---

## 7. Implementation phases

| Phase | Scope | Effort |
|---|---|---|
| **1 — Schema + math** | `lib/xp/levels.ts` (curve + tier mapping), `lib/xp/store.ts` (Redis read/write), unit tests | ~½ day |
| **2 — Server grants** | `grantXp({ wallet, action, amount, reason, dedupeKey })` with per-action daily caps · wire into friend-store, profile-store, pool-invite-store · backfill route | ~1 day |
| **3 — On-chain XP** | New keeper module that observes settle events and grants win-XP · ticket-buy XP via existing batch-creation tx signatures · idempotent via `xp:granted:<txSig>` flag | ~1 day |
| **4 — API + client lib** | `GET /api/xp/[wallet]` returns `{ xp, level, nextLevelAt, currentLevelAt, percentToNext, tier, badge }` · `useXp(wallet)` client hook | ~½ day |
| **5 — Badge assets** | Procedural SVG renderer driven by level + tier. All 100 badges generated from one component (no asset pipeline). | ~1-2 days |
| **6 — UI surfaces** | `LevelBadge`, `XpBar`, `LevelUpToast`, `LevelUpModal` components · wire into IdentityPill, profile page, friend list, search palette, pool tables | ~1-2 days |
| **7 — Leaderboard tab** | "Top Whales" view on `/leaderboard` (sorted by level → XP → lifetime spend) | ~½ day |
| **8 — Admin** | `/admin/xp` page: top earners · daily XP rate per wallet · manual grant/revoke · suspicious-rate flags | ~½ day |
| **Total** | | **~7-9 dev-days** |

---

## 8. Open questions (need founder calls before phase 1)

Each question has my recommended answer in parens. Pick agreed / change-request for each.

1. **Lifetime vs seasonal XP?** (Lifetime for v1.)
2. **Should other users see your level?** (Yes by default. Respect existing `profile.isPublic` toggle — private profiles hide level externally.)
3. **Cosmetic only or unlock benefits?** (Cosmetic-only for v1. Future possibilities: custom pool theming at L50+, profile flair at L75+, no fee discounts.)
4. **XP source mix?** (40% activity, 30% loyalty, 30% value — exact ratios set as server weights.)
5. **Should backfill happen?** (Yes — see §6. Without it, existing users are demotivated on launch day.)
6. **Should creating a private pool give XP even if it stays empty?** (Yes but small — 100 XP. Empty pools shouldn't be rewarded heavily.)
7. **Should losing a pool give consolation XP?** (Recommend: small "you played" XP, ~10 per pool you bought into and didn't win. Already covered by the per-ticket grant; no extra.)
8. **Should we tie badges to NFT mints at L75+?** (Out of scope for v1. Cool idea — each badge could later be mintable as an SPL NFT. Keep the option open by making badge metadata addressable: `/api/badge/[level]/metadata.json`.)
9. **Mythic-tier audio on level up?** (Default off. Settings toggle.)
10. **Anti-abuse threshold for admin flag?** (>10,000 XP/day. Surfaceable, not auto-blocking.)

---

## 9. Data model changes

### New Redis keys

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `xp:<wallet>` | string (number) | none | Total XP earned, lifetime |
| `xp-log:<wallet>` | ZSET | none | Score = unix-ms, member = `<action>:<amount>:<reason>:<dedupeKey>` |
| `xp-rate:<wallet>:<action>:<YYYY-MM-DD>` | string (number) | end-of-UTC-day | Daily cap counter |
| `xp:granted:<dedupeKey>` | string `"1"` | none | Idempotency for grants (tx sigs, action ids) |
| `xp:level-up:<wallet>` | ZSET | none | Score = unix-ms, member = level achieved (drives unread level-up notifications) |
| `xp:backfilled:<wallet>` | string `"1"` | none | Prevents double-backfill |

### No SQL changes

Tombola's off-chain layer is Redis-only. No schema migrations.

### API surface

| Route | Method | Auth | Returns |
|---|---|---|---|
| `/api/xp/[wallet]` | GET | none (public, respects `isPublic`) | `{ xp, level, nextLevelAt, currentLevelAt, percentToNext, tier, badge }` |
| `/api/xp/me/level-ups` | GET | wallet signature | Unread level-up events, newest first |
| `/api/xp/me/level-ups/ack` | POST | wallet signature | Mark all as read |
| `/api/admin/xp` | GET | admin | Top earners + daily-rate leaderboard + flagged accounts |
| `/api/admin/xp/grant` | POST | admin | Manual grant (logged + audited) |
| `/api/admin/maintenance/xp-backfill` | POST | admin | One-shot backfill (idempotent per wallet) |

### Frontend changes

New components (`src/components/ui/`):
- `LevelBadge.tsx` — renders the SVG for any level (procedurally generated)
- `XpBar.tsx` — progress bar w/ next-level label
- `LevelUpToast.tsx` — auto-hide toast on small level-up
- `LevelUpModal.tsx` — full-screen on tier crossing

New hook (`src/hooks/`):
- `useXp(wallet)` — fetches `/api/xp/<wallet>`, caches 30s

New page (`src/app/leaderboard/page.tsx`):
- Add "Top Whales" tab alongside existing tabs

Modified:
- `IdentityPill.tsx` — add tier-color ring around avatar, level in dropdown header
- `ProfileCard.tsx` — add XP bar + level badge prominently
- `SearchPalette.tsx` — add level pill on each row
- `FriendsDrawer.tsx` — add level pill per row
- `RecentBuysTable.tsx` — add level pill per row
- `BuyerDashboard.tsx` — add level pill per pool participant

---

## 10. Visual mockup

See `docs/design/mockups/xp-system-mockups.html` for a live HTML preview of:
- All 6 tier badge styles (one example per tier)
- The XP progress bar in profile view
- The IdentityPill with level ring
- The level-up toast
- The level-up modal (tier crossing)

---

## 11. Next steps

Reply to §8 with your calls on the open questions. Once we agree:

1. I'll write the design doc into `docs/design/xp-system/SPEC.md` (locked spec)
2. Phase 1 (math + schema + tests) goes first — that's the foundation
3. Each subsequent phase is independently shippable; we can pause after any one if you want to validate

If anything in this doc feels off — naming, curve, XP weights, the whole shrimp-to-whale frame — push back. Easier to argue paper than rewrite code.
