# Golfapalooza Implementation Plan

Deadline: Memorial Weekend 2026 (~May 23–25). Today: 2026-05-14.
Source spec: `.claude/feature intakep2.md`

## Progress

Last updated: 2026-05-14

**Done:**
- Plan written (`.claude/golfapalooza-plan.md`)
- Schema + migrations in `src/lib/db.ts`: 12 new tables (events, event_participants, course_holes, hole_scores, score_edits, scramble_teams, scramble_team_members, side_games, side_game_results, poker_hands, poker_deck_state, poker_swap_queue) + ALTERs on `rounds` for `event_id`, `scoring_mode`, `round_number`, `round_format` via `ensureRoundEventColumns()`
- Types in `src/lib/types.ts`: `GolfEvent`, `EventParticipant`, `CourseHole`, `HoleScore`, `ScoreEdit`, `ScrambleTeam`, `SideGame`, `SideGameResult`, `PokerCard`, `PokerHand`, `PokerDeckState`, `PokerSwap`, plus union types
- Events API: `GET/POST /api/events` (auto-adds creator as organizer), `GET/PATCH /api/events/[id]` (organizer-only PATCH)
- Participants API: `POST /api/events/[id]/participants`, `DELETE` + `PATCH /api/events/[id]/participants/[userId]` (organizer-only; roster locks once status leaves draft/open)
- Side-games config API: `GET` + `PUT /api/events/[id]/side-games` (PUT replaces full set; locked once In Progress)
- Start-event API: `POST /api/events/[id]/start` — validates ≥2 players, flips status to `in_progress`, creates round 1 (individual) + round 2 (scramble) both `scoring_mode='hole_by_hole'`, seeds `poker_deck_state` (`num_decks = ceil(players/4)`) and `poker_hands` rows if Poker is enabled
- Events pages: `/events` (list w/ status badges), `/events/new` (organizer setup form), `/events/[id]` (hub: Live Play lists rounds and links to scoring, plus tab nav), `/events/[id]/manage` (organizer-only: roster + group #, side-game toggles + pots, Start button)
- Scoring helper `src/lib/events.ts`: `classifyScore(strokes, par)` → eagle+/birdie/par/bogey/double/worse, `SCORE_TYPE_LABEL`, `ensureCourseHoles(courseId)` lazily seeds per-hole pars (par-4 default, adjusted toward `courses.par` total)
- Round detail API: `GET /api/events/[id]/rounds/[roundId]` returns round, hole pars, players (group-sorted), and existing hole scores w/ last-editor name
- Hole score upsert: `POST /api/events/[id]/rounds/[roundId]/holes` (player_id, hole_number, strokes — `strokes: null` clears; writes `hole_scores` + `score_edits` audit in one tx)
- Scoring page `/events/[id]/score/[roundId]`: stepper UI (hole nav chips + prev/next), per-player +/- and clear, running total + vs-par, score-type badge (Birdie/Par/etc), "last edit by" surfaced on edits, auto-resumes on lowest unfinished hole
- Standings helper `src/lib/standings.ts`: `loadEventStandings(eventId)` computes event leaderboard (strokes, through, vs-par per round), Best 18 (sum of 9 lowest strokes per round), Worst 18 (sum of 9 highest per round), Most-Same-Number (round 1 only, tiebreak lower number first), and reads enabled `side_games` with pots
- Standings API: `GET /api/events/[id]/standings`
- Event hub tabs wired: **Leaderboard** lists rank/name/thru/strokes/vs-par; **Side Games** renders per-game card with pot + computed standings for Best/Worst 18 & Most-Same (Poker + Scramble Winners show "next iteration" copy); **Payouts** sums entry pot + side-game pots with per-game breakdown
- Polling: event hub polls `/standings` every 20s while open; poker page polls `/poker` every 20s
- Poker logic `src/lib/poker.ts`: shared-deck `drawRandomCard()` honors `num_decks`; `applyPokerForHoleSave(tx, eventId, playerId, newStrokes, par, oldStrokes)` runs inside the score-save transaction. Sticky semantics: cards/wilds delta on classification change (new − old); bogey_count increments/decrements but bogey-pair card draws are sticky (never reclaim on edits). Hand size 5 with overflow → `poker_swap_queue` (incoming_card). Negative deltas → discard prompts (delta=−1, incoming_card=null).
- Poker API: `GET /api/events/[id]/poker` (hands + pending swaps + deck state, gated on poker enabled), `POST /api/events/[id]/poker/swaps/[swapId]` (actions: `swap` w/ discard_index, `skip` to discard incoming, `discard` for negative-delta entries). Once-drawn cards never return to the deck (shared-deck semantics).
- Poker page `/events/[id]/poker`: card faces w/ suit colors, current user's hand (5 slots + wild count + bogey count), pending-decision panel above hand when current user has swaps to resolve (one-tap "Swap with X" / "Skip" / "Discard X"), compact "all players" status list. Side Games tab on hub links here when poker is enabled.
- Scramble round: `team_hole_scores` table; `GET/PUT /api/events/[id]/scramble-teams` (organizer-only, name "Team N" auto-derived from per-player team-number assignment); team scoring API `POST /api/events/[id]/rounds/[roundId]/team-holes`; scoring page branches by `round.round_format`—scramble rounds render one row per team with members listed underneath, team strokes saved via team-holes endpoint
- Standings + leaderboard fan out team scores onto each team member for scramble rounds, so event leaderboard + Best/Worst 18 honor scramble totals automatically
- 3-Man Scramble Winners side game: server computes team standings for scramble round; `POST /api/events/[id]/side-games/scramble_winners/winner` (organizer-only) writes `side_game_results` with `payout_cents = floor(pot / member_count)` per member; UI in Side Games tab shows team standings with 🏆 winner highlight + organizer Win/Unset buttons + per-member payout line
- Manage page: scramble teams section (per-player Team # input, "Save teams" PUTs the structure) and "Mark completed" status transition button (in_progress → completed)
- Final payout summary (Payouts tab in completed status): per side-game winner block with 🏆 + amount: Best/Worst 18 = #1 in standings, Most-Same = #1, Scramble Winners = organizer pick, Poker = "manual pay from pot" note (Poker auto-winner-pick deferred)
- Nav: added Events tab to `BottomNav`
- TypeScript: `npx tsc --noEmit` clean
- Build: `next build` registers all event routes cleanly (events list/new/[id]/manage/poker/score)

**In progress:** _none — MVP feature-complete for Memorial Weekend deadline._

**Deferred / known gaps:**
- Poker manual winner pick at end of event (organizer eyeballs hands; not yet recorded in `side_game_results`)
- Clearing an individual hole score against a poker-enabled event leaves a small drift in the player's running totals (we don't fully reverse the cards that hole granted). Re-entering the score makes it consistent again. Documented in `applyPokerForHoleSave`.
- Per-hole par editor UI for courses not in GolfCourseAPI (today: hand-edit `course_holes` via SQL)
- Photo uploads, push notifications, websockets, offline queue, spectator follow (all explicitly out of MVP)

## Course API integration (GolfCourseAPI.com)

Real per-hole pars + handicap + yardages now imported on demand, no more all-par-4 scorecards.

**What landed:**
- Schema: `courses.external_id`, `courses.last_fetched_at`, `course_holes.yardage`; unique partial index `uq_courses_external_id` (when not null). Inline via `ensureCourseApiColumns()` + standalone migration at `supabase/migrations/2026-05-13-course-api.sql`.
- Client `src/lib/golf-course-api.ts`: typed `searchCoursesExternal(q)` + `fetchCourseDetailExternal(id)`. Auth header `Authorization: Key <GOLFCOURSE_API_KEY>`. 8-second fetch timeout. Defensive parsers normalize search hits + course detail into `ExternalSearchHit` / `ExternalCourseDetail` — parsers are best-guess against the public docs (which are gated behind login) and need a real sample response to verify.
- Search API: `GET /api/courses/search?q=…` — checks local DB first (always), then external. External hits are filtered to drop any whose `external_id` is already imported. Returns tagged `source: 'local' | 'external'`. Returns `external_error` if the API key is missing or the call fails, without breaking local results.
- Import API: `POST /api/courses/import` body `{ external_id }` — short-circuits to existing local row if already imported; otherwise one external call, writes `courses` + `course_holes` rows (par + handicap + yardage per hole) in one tx, stamps `last_fetched_at`.
- Admin refresh: `POST /api/admin/courses/[id]/refresh` (admin-only, requires `external_id` on the course) — replaces per-hole rows, updates last_fetched.
- UI: `/courses/new` now has a search box at the top with 350ms debounce, 2-char minimum, results tagged "saved" (local) or "import" (external). One-tap pick: saved → jumps to course detail; import → POSTs `/import` and jumps to the new course. Manual entry form still available below.

**Env var required:** `GOLFCOURSE_API_KEY` in `.env.local` and Vercel env vars. Get one free at golfcourseapi.com (300 req/day; we cache so it's effectively unlimited).

**Parser verified (2026-05-14).** Real GolfCourseAPI response confirmed: top-level envelope `{ course: {...} }`; `tees` is an object keyed by gender (`{ female: [...], male: [...] }`), each value an array of tee objects with their own `holes: [{par, yardage, handicap}]`. Parser now unwraps `course`/`data`/`result` envelopes and walks `tees.male` → `tees.female` → any other gender bucket to find the first tee with a non-empty holes array. Holes don't carry an explicit `hole_number` field; defaults to `idx + 1`. Verified end-to-end with Indian Springs Metropark (par 71, mix of 3s/4s/5s).

## Post-MVP iterations (2026-05-14)

Shipping work after the original MVP commit, in order:

- **Course API parser fixes.** `parseCourseDetail` now accepts the requested external_id as a fallback (the API's detail response wraps things under `course`); added envelope unwrapping for `course` / `data` / `result`. Discovered the tees-as-gender-keyed-object shape and updated hole extraction. Console-logs the raw response when no holes are found, for future iterations.
- **Side games perf.** `loadEventStandings` now parallelizes the three independent up-front queries (players + rounds + side_games) and the `ensureCourseHoles` + hole_scores fetch. Added missing index `idx_scramble_teams_round`. Event hub + poker page polling pauses when the tab is hidden and skips entirely for draft/completed/archived events. Poll bumped 20s → 30s. Migration: `supabase/migrations/2026-05-14-perf-index.sql`.
- **Scoring optimistic UI.** Score buttons no longer wait for the full server roundtrip + round refetch. Local `pendingScores: Map<key, strokes|null>` overlays fetched data; +/− updates the display instantly and fires the save in the background. On failure, the optimistic value reverts unless the user has already typed past it. Background 30s refresh (visibility-aware) brings in peer edits. Buttons are no longer disabled while a save is in flight — you can mash + to bump 4 → 7 in one motion.
- **Poker page crash #1 (empty data).** `GET /api/events/[id]/poker` was returning `{ enabled: false }` without `hands`/`pending_swaps` arrays when poker wasn't enabled, and the page's `useMemo` tried `data.hands.find(...)` → crash. API now always returns the arrays; page guards with `Array.isArray`.
- **Organizer can play.** Split `event_participants` role: added `is_organizer BOOLEAN` flag, normalized all rows to `role='player'`. Event creator becomes `role='player'` + `is_organizer=true`, so they're in the players list and can score. All seven `isOrganizer()` API checks switched from `role='organizer'` to `is_organizer=TRUE`. Manage page shows an "organizer" badge; the Remove button is hidden for organizers. Migration: `supabase/migrations/2026-05-14-organizer-flag.sql`.
- **Delete event.** `DELETE /api/events/[id]` — organizer or admin. Removes rounds first so the cascade clears hole_scores / score_edits / scramble teams / team_hole_scores / side games / poker state. Manage page has a red "Danger zone" button.
- **Poker crash #2 (JSONB-as-string).** The `postgres` lib with `prepare:false` (required for the pgbouncer transaction pooler) returns JSONB columns as text strings instead of parsed arrays. That broke poker rendering with `cards.map is not a function` and was silently corrupting `poker_hands.cards` inside `applyPokerForHoleSave` (spreading a string into the array). Added defensive `asJson` / `asJsonArray` normalization at every read site: `GET /api/events/[id]/poker` (cards, drawn, incoming_card), `lib/poker.ts` (`loadHand`, `loadDeck`). Existing corrupted data on a poker-enabled event needs a one-shot reset:
  ```sql
  UPDATE poker_hands SET cards='[]'::jsonb, wild_count=0, bogey_count=0 WHERE event_id = <id>;
  UPDATE poker_deck_state SET drawn='[]'::jsonb WHERE event_id = <id>;
  DELETE FROM poker_swap_queue WHERE event_id = <id>;
  ```
  or just delete the event entirely.

## Post-MVP iterations (2026-05-18)

- **Poker swap "max size 5" bug.** Same JSONB-as-string class as crash #2 — `POST /api/events/[id]/poker/swaps/[swapId]` was reading `poker_hands.cards` raw, so `[...hand.cards]` spread the JSON *string* (≈100 chars) into `nextCards`, blowing the `nextCards.length > MAX_HAND` guard on every swap attempt. Fixed by parsing `cards` and `incoming_card` through local `asCards` / `asIncoming` helpers.
- **Poker swap UI: one decision at a time.** The page used to render every pending swap at once (so the next incoming card was visible before you resolved the current one). Now shows only `mySwaps[0]` with an "(N more after this)" hint; resolving advances to the next.
- **Wild redesign — shared community card.** Wilds are no longer a per-player counter. There's now exactly ONE community wild per event, drawn from the shared deck, visible to all players. Players' effective hand is their 5 cards + the community wild = 6 cards for the manual judging pass. Re-rolls randomly on every birdie or eagle (sticky semantics — only when transitioning into birdie/eagle from a non-birdie/eagle score). Seeded at event start. Old wild stays in `deck.drawn` (shared-deck "once drawn, always drawn" rule). Per-player `poker_hands.wild_count` is left in place as a vestigial 0 (no reads, no writes from app code). Schema add: `poker_deck_state.wild_card JSONB`. Migration: `supabase/migrations/2026-05-18-poker-wild-card.sql`.

**TypeScript + build clean.**

## Deployment note

`SKIP_DB_BOOTSTRAP=1` is set in Vercel Prod (per memory). New tables/columns will NOT auto-create on deploy. Migrations to run in prod in order (all idempotent):

1. `supabase/migrations/2026-05-13-events.sql` — original Golfapalooza schema
2. `supabase/migrations/2026-05-13-course-api.sql` — `external_id`, `last_fetched_at`, `yardage`
3. `supabase/migrations/2026-05-14-perf-index.sql` — `idx_scramble_teams_round`
4. `supabase/migrations/2026-05-14-organizer-flag.sql` — `is_organizer` flag + backfill
5. `supabase/migrations/2026-05-18-poker-wild-card.sql` — `poker_deck_state.wild_card` JSONB

Plus `GOLFCOURSE_API_KEY` in Vercel env vars (Production scope) before course imports work in prod.

## Scope decisions (locked)

- Events wrap rounds additively: `rounds.event_id` nullable, casual rounds unchanged.
- Hole-by-hole required for events, optional for casual rounds (`rounds.scoring_mode = 'total' | 'hole_by_hole'`).
- All event participants must be existing app users (no guest entries for events; casual rounds keep `scores.guest_name`).
- Open score editing: anyone can edit anyone's score; `score_edits` audit log records who/when/old/new.
- No spectator-follow concept; any logged-in user has read access.
- Polling-based live views (~20s). No websockets, SSE, or push.
- Side games shipping: **Poker, Best 18, Worst 18, Most-Same-Number, 3-Man Scramble Winners**. (CTP deferred.)
- Payouts: display-only computation. No payment integration.
- Eagles treated as birdies for poker (2 cards + 1 wild).
- Most-Same-Number computed from round 1 only.
- Poker deck count = `ceil(active_players / 4)` standard 52-card decks combined.
- Poker on score edits: sticky cards + manual reconcile queue (no retroactive removal).

## Conventions (match existing repo)

- Schema lives inline in `src/lib/db.ts` as `SCHEMA_SQL` constant + `ensureXxx()` migration helpers.
- DB access: `db.prepare("SQL with ?").get<T>(...args)` / `.all()` / `.run()`. Placeholders are `?`.
- Transactions: `withTransaction(async (tx) => ...)`.
- Auth: `await getCurrentUser()` → `User | null`. No RLS.
- API routes: `src/app/api/<resource>/route.ts` and `[id]/route.ts`, returning `NextResponse.json`.
- Pages: app router; client components use `useAuth()`. Match the `/rounds/new` shape.
- **Next 16 only**: consult `node_modules/next/dist/docs` before unfamiliar APIs; `proxy.ts` not `middleware.ts`.

## Data model

### Modified tables

- `rounds`: add `event_id INTEGER REFERENCES events(id) ON DELETE SET NULL`, `scoring_mode TEXT NOT NULL DEFAULT 'total' CHECK (scoring_mode IN ('total','hole_by_hole'))`, `round_number SMALLINT` (event round ordinal: 1, 2; null for non-event rounds).
- `courses`: needs per-hole par data for hole-by-hole scoring. Add `course_holes` lookup table OR a `hole_pars INTEGER[]` array column (length = `courses.holes`). Decision: **separate `course_holes` table** (`course_id`, `hole_number`, `par`, `handicap_index NULL`) — extensible. Seeded with even-distribution defaults if missing (so existing courses don't block scoring).

### New tables

```
events (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  course_id     INTEGER NOT NULL REFERENCES courses(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','open','in_progress','completed','archived')),
  exclude_from_leaderboard BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

event_participants (
  event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id),
  role       TEXT NOT NULL CHECK (role IN ('organizer','player')),
  group_num  SMALLINT,            -- foursome assignment, nullable
  PRIMARY KEY (event_id, user_id)
)

hole_scores (
  id          SERIAL PRIMARY KEY,
  round_id    INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES users(id),
  hole_number SMALLINT NOT NULL,
  strokes     SMALLINT NOT NULL,
  updated_by  TEXT REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id, hole_number)
)

score_edits (
  id          SERIAL PRIMARY KEY,
  hole_score_id INTEGER REFERENCES hole_scores(id) ON DELETE CASCADE,
  round_id    INTEGER NOT NULL,
  player_id   TEXT NOT NULL,
  hole_number SMALLINT NOT NULL,
  old_strokes SMALLINT,           -- null if first insert
  new_strokes SMALLINT,
  edited_by   TEXT NOT NULL REFERENCES users(id),
  edited_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)

scramble_teams (
  id        SERIAL PRIMARY KEY,
  round_id  INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  name      TEXT NOT NULL
)

scramble_team_members (
  team_id  INTEGER REFERENCES scramble_teams(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (team_id, user_id)
)

side_games (
  id        SERIAL PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('poker','best18','worst18','most_same','scramble_winners')),
  pot_cents INTEGER NOT NULL DEFAULT 0,
  config    JSONB,                -- per-game settings (e.g., poker wild rules)
  UNIQUE (event_id, kind)
)

poker_hands (
  event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES users(id),
  cards       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{deck:0,suit:'S',rank:'A'}, ...] max 5
  wild_count  SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, player_id)
)

poker_deck_state (
  event_id   INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  drawn      JSONB NOT NULL DEFAULT '[]'::jsonb     -- list of drawn card identifiers
)

poker_swap_queue (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id    TEXT NOT NULL REFERENCES users(id),
  incoming_card JSONB,           -- null if it's a "cards-owed" adjustment from a score edit
  delta        SMALLINT NOT NULL DEFAULT 1,  -- +N or -N cards to reconcile
  resolved_at  TIMESTAMPTZ,
  swapped_card JSONB,            -- card discarded when resolved (if applicable)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)

side_game_results (
  id            SERIAL PRIMARY KEY,
  side_game_id  INTEGER NOT NULL REFERENCES side_games(id) ON DELETE CASCADE,
  player_id     TEXT REFERENCES users(id),
  team_id       INTEGER REFERENCES scramble_teams(id),
  rank          SMALLINT,
  payout_cents  INTEGER NOT NULL DEFAULT 0
)
```

## Poker logic

Per saved hole_score, on insert/update compute the score type:
- strokes vs par: par/birdie/bogey/dbogey/eagle (eagle = ≤ par−2)
- birdie or eagle: draw 2 cards + 1 wild
- par: draw 1 card
- bogey: increment cumulative bogey counter for player; every 2nd bogey draws 1 card
- doublebogey+: nothing

Bogey counter persisted in `poker_hands` as `bogey_count` (add column). Draw flow:
1. Compute draws_owed + wilds_owed.
2. For each card to draw, if hand size < 5 → append. If hand size = 5 → push entry into `poker_swap_queue` with `incoming_card`.
3. Wilds added directly to `wild_count` (no swap; they're separate).
4. Update `poker_deck_state.drawn`.

Score edit reconciliation:
- Recompute what the draws_owed SHOULD have been with new strokes vs what was recorded historically (via `score_edits` lookup).
- Difference goes into queue as `delta` (`incoming_card=null` for negative deltas — player picks one to discard).

## UI surface

- `/events` – list w/ status badges
- `/events/new` – organizer setup (name, course, dates, entry fee, side game toggles, exclude-from-leaderboard)
- `/events/[id]` – hub with tab nav (Server Component for shell; tabs are client islands that poll)
  - **Live Play** – scorecards for both rounds, per-hole entry grid, group filter
  - **Side Games** – live standings for each enabled game + poker hand viewer w/ pending swap queue
  - **Leaderboard** – event-wide leaderboard (gross, net later)
  - **Payouts** – pot summary, winners, payout split
  - **Rules** – markdown from `events.description`
- `/events/[id]/manage` – organizer-only: participants, groups, scramble teams, status transitions
- `/events/[id]/poker` – per-player poker hand + swap resolver

## API routes

- `POST /api/events`, `GET /api/events`, `GET /api/events/:id`, `PATCH /api/events/:id` (status, settings)
- `POST /api/events/:id/participants`, `DELETE /api/events/:id/participants/:userId`
- `POST /api/events/:id/start` (transition draft/open → in_progress, locks participants, creates 2 rounds, seeds poker deck/hands)
- `POST /api/events/:id/rounds/:roundId/holes` – upsert a hole score (writes hole_scores + score_edits + triggers poker draw + side-game recompute)
- `POST /api/events/:id/poker/swaps/:swapId/resolve` – resolve a swap (keep_new=true|false, optional discard_index)
- `POST /api/events/:id/scramble-teams` – create/update teams (round 2 only)
- `POST /api/events/:id/side-games/:kind/winner` – manual winner pick (poker, scramble winners)
- `GET /api/events/:id/live` – aggregated payload for tab views (scorecards, side game standings, leaderboard) — single endpoint for polling

## Build order (this branch)

1. ✅ Plan
2. ✅ Schema + migrations in `db.ts`
3. ✅ Types in `types.ts`
4. ✅ Events list + create page + `POST/GET /api/events`
5. ✅ Event detail hub skeleton + tab routing
6. ✅ Participants management + group assignment
7. ✅ Round creation on event start (2 rounds w/ scoring_mode='hole_by_hole')
8. ✅ Hole-by-hole scoring grid + scoring API + edit audit
9. ✅ Live leaderboard (event-scoped)
10. ✅ Side games: Best 18 / Worst 18 / Most-Same (auto)
11. ✅ Scramble teams + scramble round wiring
12. ✅ Poker: deck seed, draw on score save, hand view, swap queue
13. ✅ 3-Man Scramble Winners (manual)
14. ✅ Payouts view (pot summary + final winner payouts on completed status)
15. ✅ Polling on live tabs (~20s)

Cut order if time gets tight: drop Poker swap UI (degrade to count-only), then drop Most-Same, then drop scramble round (run as second individual round).

## Open items to revisit

- Per-hole par data: bootstrap with `par/holes` even split if no `course_holes` rows exist. Real per-hole pars can be backfilled by organizer in event setup.
- Wild card pool: unlimited (just a count). Not drawn from any deck.
- Edge: if `poker_deck_state.drawn` exhausts a 2-deck pool (104 cards) during play, log and disable further draws. Unlikely with 8 players over 36 holes.
