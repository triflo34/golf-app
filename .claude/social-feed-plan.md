# Social Activity Feed — Implementation Plan

Feature #3 from `.claude/feature intake3.md`. Auto-generated event stream so the app feels alive between rounds.

## Decisions

- **Surface**: dedicated `/feed` page reachable from the bottom nav. Not on home (leaderboard already dominates).
- **Reactions/comments**: deferred to v2. Ship generation + display first.
- **Event kinds (v1)**:
  - `round_completed` — once per round, with winner crowned
  - `birdie` / `eagle` — per (round, player, hole)
  - `bogey_free_nine` — front 9 or back 9 with zero over-par holes
  - `career_best` — gross score strictly below player's prior best (same hole_count)
  - `first_sub_X` — first time under a score threshold (80, 90, 100 for 18-hole; 40, 45 for 9-hole)
- **Event victories + leaderboard rank changes**: deferred to v2 (rank changes need a snapshot table).
- **Filters**: scope toggle (mine vs everyone). Kind filter chips deferred.
- **Time grouping**: Today / Yesterday / Earlier this week / Earlier (relative buckets in UI).

## Progress

Updated after every step.

- [ ] **Step 1 — Schema** — `feed_events` table + dedup key + indexes + ensure helper
- [ ] **Step 2 — Generation library** — `src/lib/feed-events.ts` with `generateEventsForRound(roundId)` (idempotent)
- [ ] **Step 3 — Hooks** — wire generation into the four round-write paths (POST /api/rounds, POST /api/rounds/scorecard, POST /api/rounds/live/[id]/finish, PUT /api/rounds/[id])
- [ ] **Step 4 — Feed API** — `GET /api/feed` with cursor pagination + scope filter + display-ready fields
- [ ] **Step 5 — Feed UI** — `/feed` page (classic + v2 variants) with infinite scroll + time-grouped sections + nav tab
- [ ] **Step 6 — Backfill admin + memory + push**

## Schema

```sql
CREATE TABLE feed_events (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN (
                'round_completed','round_win','birdie','eagle',
                'bogey_free_nine','career_best','first_sub_threshold'
              )),
  round_id    INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
  player_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
  guest_name  TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,            -- pulled from rounds.played_at (so it sorts by *round* time, not insert time)
  dedup_key   TEXT NOT NULL UNIQUE,            -- e.g. "birdie:42:USER123:7"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feed_events_occurred_at ON feed_events(occurred_at DESC, id DESC);
CREATE INDEX idx_feed_events_round       ON feed_events(round_id);
CREATE INDEX idx_feed_events_player      ON feed_events(player_id);
```

**Dedup key conventions**:
- `round_completed:<round_id>`
- `round_win:<round_id>:<winner_key>` (one per winner if tied)
- `birdie:<round_id>:<player_key>:<hole>`
- `eagle:<round_id>:<player_key>:<hole>`
- `bogey_free_nine:<round_id>:<player_key>:<front|back>`
- `career_best:<round_id>:<player_id>` (registered users only — guests have no career)
- `first_sub_threshold:<round_id>:<player_id>:<threshold>` (e.g. `:80`, `:90`)

`player_key` = `u:<id>` or `g:<lowered name>` for guests.

## Generation

`generateEventsForRound(roundId, tx?)`:
1. Load round (course_name, played_at, hole_count) and all `scores` rows.
2. If no scores, no-op (live round mid-play).
3. Compute round_completed event (data: winner names, scores list, course, hole_count).
4. Compute round_win event per winner (strict-lowest, ties handled — emit one per tied winner with `tied: true`).
5. Load `hole_scores` for the round + per-hole pars (snapshotted on hs).
6. For each hole_score: birdie/eagle events.
7. For each (player, front|back nine) on 18-hole rounds, or the played nine on 9-hole: check bogey_free_nine (all holes ≤ par, ≥1 hole entered).
8. For each registered player: query prior MIN(gross_score) at same hole_count → career_best if strictly less.
9. For each registered player: query for sub-threshold firsts.
10. All INSERTs use `ON CONFLICT (dedup_key) DO NOTHING`, so the function is safe to re-run on round edits.

`occurred_at` = `rounds.played_at::timestamptz` so feed reads chronologically by *when played*, not when inserted. Edits don't move events to the top.

## Hooks

Add a single call `after(() => generateEventsForRound(roundId))` (via `next/server` `after()`) so feed generation never blocks the round-save response:
- `POST /api/rounds` ([src/app/api/rounds/route.ts](src/app/api/rounds/route.ts)) — after insert
- `POST /api/rounds/scorecard` ([src/app/api/rounds/scorecard/route.ts](src/app/api/rounds/scorecard/route.ts)) — after insert
- `POST /api/rounds/live/[id]/finish` — after status flip
- `PUT /api/rounds/[id]` — after update (idempotent thanks to dedup)

Also: admin "Backfill feed" button on `/admin` for one-shot full-history generation.

## Feed API

`GET /api/feed?cursor=<id>&limit=20&scope=mine|all`
- `cursor`: last seen feed_events.id (descending pagination)
- Returns `{ items: [...], next_cursor: <id|null> }`
- Each item is display-ready: `{ id, kind, occurred_at, round_id, course_name, hole_count, player_name, player_id, is_guest, data }`
- `scope=mine` filters to events where `player_id = me` OR the round has a participant matching `me`.

## UI

`/feed` page:
- Top: small scope toggle pills (`Mine` / `Everyone`)
- Body: infinite scroll list with sticky-ish time-bucket headers (Today / Yesterday / This week / Earlier)
- Each card: kind icon (🏆 🐦 🦅 ⭐ 🔥), one-line headline, secondary line (course + relative time), tappable → `/rounds/[id]`
- IntersectionObserver sentinel at the bottom loads the next page

Add nav tab between Stats and Profile? Nav already has 6 items; adding makes 7. Acceptable on phones ≥375px. If too tight, swap "Courses" for "Feed" (Courses still reachable from round-new and home recents).

## Risks

- `feed_events` could grow fast on big history (hundreds of birdies, etc). Tracking with cursor pagination handles it; storage is cheap.
- Career-best detection runs an extra query per registered player per round (≤8). Fine for our scale.
- Round edits regenerate events — dedup_key handles it without duplicates, but doesn't remove events that no longer apply (e.g., a birdie hole edited away). Acceptable in v1 — score edits are rare and the audit log compensates.
