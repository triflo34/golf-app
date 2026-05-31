# The Match — Golf App Feature Digest

A private golf scoring + competition web app for ~40 Oakland County (Michigan) public courses. Built for a friend group, phone-first, but scope is sprawling.

## Stack at a glance
- **Next.js 16 + React 19 + Tailwind 4**, App Router, Server Components, `proxy.ts` (not middleware.ts)
- **Postgres** via Supabase transaction pooler (port 6543), `postgres` lib, hand-rolled migrations
- **Custom session-cookie auth** — username + password only, no email anywhere
- **Recharts** for analytics
- Deployed on **Vercel**; `SKIP_DB_BOOTSTRAP=1` in prod (schema applied manually via Supabase SQL editor)
- **Dual UI mode**: "classic" vs "v2" (dark/gold mobile redesign) toggled via cookie — additive components under `src/components/v2/`, not in-place restyles

---

## Shipped features

### Auth & accounts
- Username + password registration / login / logout
- Admin role (seeded `admin` / `admin` on first init)
- Profile page: change password, change display name, change username
- Admin panel: list users, reset passwords, hide users, promote a guest → real user (re-links all their scores), merge duplicate guests

### Course catalog
- ~40 Oakland County public courses pre-seeded
- Browse / search courses list, course detail page with top-10 scores there
- **Add a course** (any logged-in user) with duplicate name+city detection
- **Edit per-hole pars/handicaps/yardages** on `/courses/[id]/edit-holes`
- Edit course ratings (18-hole + Front 9 + Back 9 rating/slope)
- **Favorite courses** — heart toggle, favorites section atop courses list
- **Recent searches** — chip list (capped 20/user)
- **GolfCourseAPI.com integration** — search by name, one-tap import course + per-hole pars/handicaps/yardages; 30-day staleness banner; admin manual refresh; rate-limit (300/day) empty state
- Inline course search inside the round-creation flow (debounced, "saved" vs "import" badges)

### Casual round logging (the original app)
- Log a round: course → date → up to 8 players (registered or typed guest names) → gross scores → notes
- **9-hole OR 18-hole** rounds, with Front 9 / Back 9 selector for 9-hole
- Round detail page (view / edit / delete — creator or admin only)
- Recent rounds feed on home

### Live Round Mode (just shipped 2026-05-28)
- Dedicated `/rounds/live/[id]` hole-by-hole scorer
- "Start Live Round" CTAs on home + new-round page
- **Real-time leaderboard** on top — crown on leader, T-prefixed ties, vs-par color, rank-change flash animation
- Sticky bottom dock — hole nav (← Hole N · Par X →), scrollable player rows with big +/− buttons + Par quick-tap
- 30s polling background refresh (paused when tab hidden)
- **Optimistic UI** — score updates are instant, server roundtrip is background
- **Offline queue** (IndexedDB FIFO) — mutations queue when offline, auto-drain on `online` event, "Sync Now" banner
- Supports both registered users and guests
- "Finish round" writes aggregate scores + flips status, kicks off weather backfill
- Round detail page auto-redirects to live view when `status='live'`

### Scorecard upload
- Photo-of-paper-scorecard parsing flow (`/api/scorecard/parse`) — round-trips through round edit too

### Leaderboard
- Season filter (All / 2026 / 2025 / 2024)
- Holes filter (18 / 9 / All) — keeps formats fairly separated
- Scope toggle (mine / everyone)
- Columns: rounds played, wins, best score, **points**
- **Placement points** — linear N..1 per round, competition ranking with ties sharing rank
- 1st / 2nd / 3rd / 4th counts inline (with tied-count annotations)
- **Score Trends line chart** (Recharts) — toggle Scores / Points / Place metric, per-player series, custom tooltip showing **weather conditions** for each round
- Win = strict-lowest in a field of ≥2 players (solo rounds don't count)

### Stats page (tabbed)
- **Head-to-Head** — pick two players, W-L-T record, clickable round history
- **Player** — overview, recent rounds with placement, by-course breakdown
- Season filter applies to both tabs
- Fun stats API (`/api/stats/fun`)

### Weather integration
- Open-Meteo (archive >5d, forecast w/ past_days for recent) + Nominatim geocoding
- Auto-fetched after round create / edit (when course or date changes)
- Weather strip on round detail; tooltip on leaderboard Score Trends chart
- Admin "Backfill weather" button (batched 25, loops until done)

### Handicap system (USGA-style)
- Best 8 of last 20 differentials → handicap index
- **9-hole rounds use 9-hole rating/slope** (front vs back), expressed as 18-hole-equivalent
- Per-user index surfaced on profile page with "Need N more rounds" fallback
- Course handicap computed per-course / per-tee combination
- New round flow shows `HC X · course Y` under each registered player after course pick
- Net score calculation

### Fair Match Builder (`/matches/build`)
- Pick course + 9/18 + Front/Back + player roster + format
- **Formats**: scramble, best ball, individual
- **Scramble weighting**: USGA 35/15, 30/20/10, 25/20/15/10
- **2-team mode**: enumerate every C(n, aSize) split, dedupe mirrors, rank by fairness delta
- **3+ team mode**: auto-balanced sizing (up to 4 teams)
- **Handicap allowance** pills (100% / 95% / 90% / 85%)
- Returns **top 5 most-balanced arrangements** with team HCs, fairness delta, per-player chips
- Guest support — manually enter their course HC
- Linked from rounds/new on both classic + v2

### Golfapalooza (multi-round event module)
Built for an annual Memorial Weekend event (2 rounds across the weekend, group of ~8). **Feature-complete and shipped.**
- Event lifecycle: draft → open → in_progress → completed → archived
- Organizer / player roles (organizer can also play — `is_organizer` flag is separate from role)
- Per-event entry fee + total pot tracking
- 2 rounds: round 1 individual stroke play, round 2 scramble
- **Scramble teams** — organizer assigns by team number; team scoring with members fanned-out for individual standings
- **Hole-by-hole scoring stepper UI** — chips for hole nav, +/− per player, running total + vs-par, score-type badges (Birdie / Par / Bogey / etc), "last edited by" attribution
- **Score audit log** (`score_edits` table) — anyone can edit anyone's score; everything tracked
- **Open editing** — no anti-cheat, social trust model
- **Event leaderboard** — separate from main app leaderboard, vs-par + thru + strokes
- **Polling-based live updates** (~30s, visibility-aware)
- **Optional leaderboard exclusion** — event scores don't pollute main app stats/handicap

**Side games / mini-game engine** (modular):
- **Poker** — 1 card/par, 1 card/2-bogeys, birdie=2 cards + community wild reroll; shared deck (`ceil(players/4)` standard 52-card decks); max 5 cards/hand + swap queue when full; **single community wild** visible to all (replaces per-player wild count); manual winner pick at end; sticky semantics on score edits (cards never reclaimed retroactively); one-at-a-time swap UI
- **Best 18** — sum of 9 lowest holes per round
- **Worst 18** — sum of 9 highest per round
- **Most-Same-Number** — most repeated score in round 1 only
- **3-Man Scramble Winners** — organizer picks team winner, pot split evenly
- (Closest-to-pin deferred)

**Event UI tabs**: Live Play / Leaderboard / Side Games / Payouts / Rules
**Payouts view**: pot summary + per-side-game winner blocks + entry pot

### Cross-cutting
- **Bottom nav** (mobile-first): Home / Rounds / Stats / Events / Profile
- **PWA manifest** present (no service worker yet)
- **Offline banner** (global mount) — shows when offline + queued mutation count + Sync Now
- **Defensive degradation** — APIs catch missing-table/column errors so deploys don't 500 before migrations run

---

## In flight / on hold

### v2 design-system redesign (in progress)
Dark/gold mobile redesign (Fraunces serif + Outfit sans, gold-on-deep-green, translucent cards) rolling out screen-by-screen under `src/components/v2/` + `*-v2` page variants. Additive — classic is never restyled in place; toggled via the `data-ui` cookie.
- **Ported to spec:** design tokens + fonts, shared components (PageShell, Card, Pill, BottomNav [5 items], SectionTitle, StatTile, Avatar, Header, SegmentedControl, LeaderboardRow, ScorePill, LivePill, SyncBanner), Home (§7.1), Stats "Board" tab (§7.3), Live Round Mode (§7.2 — gold header + live pill, sync banner, leaderboard rows, hole navigator, sticky scoring dock with steppers + Par quick-tap + score-type chips)
- **Remaining:** Event / Golfapalooza (§7.4), Profile (§7.5); optional Stats podium

- **Leaderboard fairness rework** — groups that play more dominate; deferred pending direction (weighted scoring vs win-rate vs participation-adjusted)
- **Twosome / sub-group leaderboards** — recurring 2-player groups distort global; deferred
- **Stroke allocation visualization** on the scorecard (per-hole strokes-received indicator) — math exists, needs UI
- **Match Builder polish** — show which actual hole numbers the strokes fall on

---

## Planned / on the wishlist (`feature intake3.md`)

### Social / engagement
- **QR-code event joining** — unique invite codes, expiring tokens, mobile camera scan, deep-link / web fallback, admin revoke
- **Social activity feed** — auto-generated events (round wins, birdies, career-best, CTP wins, leaderboard changes, win streaks, rivalry updates, mini-game results, event victories); infinite scroll; time-grouped; filter by group / friends / events; optional reactions + comments
- **AI round recaps** — hole-by-hole + leaderboard + weather + player names → "sports media + friendly trash talk" tone; multiple styles (dramatic, comedic); cached after generation; async post-completion; shareable

### More mini games (extending the engine)
- Skins, Closest-to-Pin (currently deferred), Wolf, Vegas, Match play, Nassau
- Solo + team formats, custom per-event rules, auto payout calculation

### Infra & polish
- **USGA Handicap MCP integration** — official handicap calc via MCP server, auto-sync after rounds
- **PWA install prompt** + iOS home-screen polish
- **Invite-link new-player flow** (one-shot registration token)
- **Admin reset another user's password** (currently only own password)
- **Self-serve account deletion**
- **Per-player round notes** (schema supports it, UI doesn't surface)
- **Round photos** (image storage — biggest scope risk, deferred)
- **JSON DB export / backup**
- **Edit / delete courses** (UI gaps)

---

## Known sharp edges (worth disclosing to design AIs)
- Two parallel UIs (classic + v2) — design proposals should pick one or explicitly cover both
- No CSRF protection (acceptable for friend-group app; revisit if public)
- Open score editing — by design, social trust model, no role gates beyond organizer for events
- Polling-only live updates (no WebSockets / SSE / push)
- Scope creep is real — started as "log a score, see a leaderboard," now includes events, side games, handicaps, weather, AI recaps, social feed, QR joins
