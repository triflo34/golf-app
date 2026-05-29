# Live Round Mode — Implementation Plan

Feature #1 from `.claude/feature intake3.md`. Standalone live round scoring (no event needed). Lifts the proven event-scorer UX to standalone rounds and adds a real-time leaderboard.

## Decisions

- **Players**: registered users + guests both supported (requires loosening `hole_scores` schema).
- **Entry point**: new dedicated "Start Live Round" button on home + new-round page (no toggle on the existing new-round form).
- **Mini games**: deferred — they land with feature #5 (Mini Game Engine).
- **Leaderboard logic**: computed server-side in `GET /api/rounds/live/[id]` (one source of truth, easy to reuse). Competition ranking with ties, par-relative, "thru N", current-leader marker.

## Progress

Updated after every step so the user can pick up where this left off if a session dies.

- [x] **Step 1 — Schema** — `hole_scores` guest support + `rounds.status` + `round_players` ✅
- [x] **Step 2 — APIs** — `POST/GET/finish /api/rounds/live` and `POST /api/rounds/live/[id]/holes` ✅
- [x] **Step 3 — Entry flow** — `/rounds/live/new` page + home CTA + secondary button on new-round page ✅
- [x] **Step 4 — Live page** — `/rounds/live/[id]` with leaderboard card, optimistic per-hole entry, 30s poll, finish button ✅
- [x] **Step 5 — Memory + glue** — update `.claude/memory.md`, save auto-memories ✅

🎉 **Feature complete.** `npx next build` passes. Routes registered: `/api/rounds/live`, `/api/rounds/live/[id]`, `/api/rounds/live/[id]/holes`, `/api/rounds/live/[id]/finish`, `/rounds/live/new`, `/rounds/live/[id]`.

## Post-ship bugfix pass (2026-05-28, same day)

User feedback after first try:
1. **No way to save/end a round** — Finish was disabled until all 8×18 cells filled, undiscoverable.
2. **Score entry not pinned to bottom** — player rows scrolled with content; entry slipped off-screen as the page grew.
3. **Lag between players on optimistic updates** — 30s poll was wiping the entire `pending` map, killing in-flight optimistic state.

Fixes:
- [src/components/live-round-view.tsx](src/components/live-round-view.tsx) `load()` now only drops pending entries whose server state confirms them (matches `pending=value` or `pending=null & no row`). Unsent/in-flight writes stay visible.
- Layout rewritten — sticky bottom **dock** containing: hole nav row (← Hole N · Par X →), scrollable player entry list (max 40vh), prominent Finish button (always enabled, shows blank count: `Finish round (12 blank)`).
- [src/app/api/rounds/live/[id]/finish/route.ts](src/app/api/rounds/live/[id]/finish/route.ts) relaxed: only requires ≥1 hole_score total. Players with zero holes get skipped from the aggregate `scores` write. Finishing early is OK.

## Steps

### 1. Schema — guest support in `hole_scores` + round status

Files: [src/lib/db.ts](src/lib/db.ts)

- Drop `NOT NULL` on `hole_scores.player_id`
- Add `hole_scores.guest_name TEXT`
- Add `CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL))`
- Replace `UNIQUE (round_id, player_id, hole_number)` with two partial unique indexes
- Add `rounds.status TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('live','final'))`
- New `ensureHoleScoresGuestColumn` + `ensureRoundsStatusColumn` self-migration helpers
- Manual SQL also has to run in Supabase prod (per the convention in `db.ts`)

### 2. Live round APIs

Files (new):
- `src/app/api/rounds/live/route.ts` — `POST` creates a `status='live'`, `scoring_mode='hole_by_hole'` round with players (registered or guests) and no scores yet.
- `src/app/api/rounds/live/[id]/route.ts` — `GET` returns `{ round, holes, players, scores, leaderboard }`. Leaderboard computed server-side with competition ranking + ties + vs-par.
- `src/app/api/rounds/live/[id]/holes/route.ts` — `POST` upsert per-hole strokes by `player_id` OR `guest_name`. Logs to `score_edits`. `strokes: null` = clear.
- `src/app/api/rounds/live/[id]/finish/route.ts` — `POST` aggregates `hole_scores` → `scores` rows, flips `status='final'`. Returns final round id.

### 3. Start Live Round entry flow

Files (new):
- `src/app/rounds/live/new/page.tsx` + `classic-new-live-round.tsx` + `v2-new-live-round.tsx` — course picker, 9/18, player list with guest input. Submits to `POST /api/rounds/live`, redirects to `/rounds/live/[id]`.

Files (edit):
- [src/app/classic-home.tsx](src/app/classic-home.tsx) + [src/app/v2-home.tsx](src/app/v2-home.tsx) — add "Start Live Round" CTA.
- [src/app/rounds/new/page.tsx](src/app/rounds/new/page.tsx) — secondary "Start a live round instead" link near the top.

### 4. Live round page

Files (new):
- `src/app/rounds/live/[id]/page.tsx` (UI-mode gate) + `classic-live-round.tsx` + `v2-live-round.tsx`
- Hole-strip nav with completion dots
- Top: leaderboard card — rank (ties as `T2`), vs-par colorized, "thru N", crown on leader, CSS transition on rank changes
- Per-player rows with big +/− buttons, Par quick-tap, optimistic state, 30s poll (paused when tab hidden), `fetchOrQueue` offline support
- Sticky bottom hole-nav strip
- "Finish round" button when all holes filled → `/finish` → redirect to `/rounds/[id]`

### 5. Memory + glue

- Update `.claude/memory.md` — Recent Changes + Current State
- Save auto-memory: `project_live_round_mode.md` (the live mode feature exists and supports guests)

## Last completed

**Step 1 done.** [src/lib/db.ts](src/lib/db.ts) edits:
- `SCHEMA_SQL` updated: `rounds.status` (live/final, default final), `hole_scores.player_id` nullable + `guest_name`, XOR check, two partial UNIQUE indexes, `score_edits` same nullability.
- New `round_players` table — roster for live rounds (player_id XOR guest_name, seq for stable ordering). Lets players appear before any hole_scores exist without polluting `scores`.
- New helpers: `ensureRoundsStatusColumn`, `ensureHoleScoresGuestColumns`, `ensureRoundPlayersTable`.
- Wired into both `bootstrap()` (fresh installs) and `ensureCriticalColumns()` (runs in prod even with `SKIP_DB_BOOTSTRAP=1`).
- All existing `INSERT INTO hole_scores` / `INSERT INTO score_edits` callers set `player_id` only, so they satisfy the new XOR check unchanged.
- Live rounds DO NOT write to `scores` until `/finish`, so the leaderboard naturally excludes them — no leaderboard SQL change needed.

**Prod migration SQL** (run via Supabase SQL editor before deploying step 2):

```sql
-- rounds.status
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rounds_status_check') THEN
    ALTER TABLE rounds ADD CONSTRAINT rounds_status_check CHECK (status IN ('live','final'));
  END IF;
END $$;

-- hole_scores + score_edits guest support
ALTER TABLE hole_scores  ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE hole_scores  ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE score_edits  ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE score_edits  ALTER COLUMN player_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hole_scores_player_or_guest_check') THEN
    ALTER TABLE hole_scores ADD CONSTRAINT hole_scores_player_or_guest_check
      CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hole_scores_round_id_player_id_hole_number_key') THEN
    ALTER TABLE hole_scores DROP CONSTRAINT hole_scores_round_id_player_id_hole_number_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hole_scores_player
  ON hole_scores(round_id, player_id, hole_number) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hole_scores_guest
  ON hole_scores(round_id, guest_name, hole_number) WHERE guest_name IS NOT NULL;

-- round_players roster
CREATE TABLE IF NOT EXISTS round_players (
  round_id   INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id  TEXT REFERENCES users(id),
  guest_name TEXT,
  seq        SMALLINT NOT NULL DEFAULT 0,
  CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_round_players_player
  ON round_players(round_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_round_players_guest
  ON round_players(round_id, guest_name) WHERE guest_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_round_players_round ON round_players(round_id);
```

(Or rely on `ensureCriticalColumns` — the helpers run on first request after deploy.)

**Step 2 done.** New routes:
- [src/app/api/rounds/live/route.ts](src/app/api/rounds/live/route.ts) — `POST` creates a live round (course, 9/18, nine_played, players[]). Players are registered (player_id) OR guests (guest_name); XOR enforced. Roster persisted to `round_players`. No `scores` rows written.
- [src/app/api/rounds/live/[id]/route.ts](src/app/api/rounds/live/[id]/route.ts) — `GET` returns `{ round, holes, players, scores, leaderboard }`. Leaderboard built server-side: per-player aggregates (through, strokes, vs_par), competition ranking on vs_par with ties sharing rank, `is_leader` flag on rank-1 + through>0. Players with no scores yet sort to the bottom but still appear in roster.
- [src/app/api/rounds/live/[id]/holes/route.ts](src/app/api/rounds/live/[id]/holes/route.ts) — `POST` upserts strokes by `player_id` OR `guest_name` (lookup is roster-scoped + lowercase-tolerant for guests). `strokes: null` clears + logs to `score_edits`. Rejects edits when `round.status != 'live'`.
- [src/app/api/rounds/live/[id]/finish/route.ts](src/app/api/rounds/live/[id]/finish/route.ts) — `POST` requires every roster entry to have ≥1 hole_score (returns `missing[]` if not), writes aggregate `scores` rows, flips `status='final'`, kicks off weather backfill via `after()`.

Known follow-up for step 4: when a user navigates to `/rounds/[id]` (the existing round detail page) for a live round, it'll show 0 scores. Plan: redirect from `/rounds/[id]` → `/rounds/live/[id]` when `status='live'`.

**Step 3 done.** New files:
- [src/components/live-round-setup.tsx](src/components/live-round-setup.tsx) — shared `LiveRoundSetup` component (classic + v2 variants). Course picker (local list), date, 9/18 toggle, front/back nine selector when 9-hole, player picker (registered + guest), notes, "Start Live Round" CTA. Submits to `POST /api/rounds/live` then redirects to `/rounds/live/[id]`.
- [src/app/rounds/live/new/page.tsx](src/app/rounds/live/new/page.tsx) — ui-mode gate.
- [src/app/rounds/live/new/classic-new-live-round.tsx](src/app/rounds/live/new/classic-new-live-round.tsx) + v2 variant.

CTAs wired in:
- [src/app/classic-home.tsx](src/app/classic-home.tsx) — green CTA card under the title, above the season picker (pulse dot for "live" vibe).
- [src/app/v2-home.tsx](src/app/v2-home.tsx) — gold-accent variant in same spot.
- [src/app/rounds/new/classic-new-round.tsx](src/app/rounds/new/classic-new-round.tsx) + [v2-new-round.tsx](src/app/rounds/new/v2-new-round.tsx) — "Score live instead" link above the Build-a-fair-match card.

Course external search/import isn't included on the live setup page yet (the existing RoundForm's API search is heavy and not strictly needed for live mode — users probably already know which course they're at). If we want it later, can extract the API-search bits from `round-form.tsx` into a shared `CoursePicker`.

**Step 4 done.** New files:
- [src/components/live-round-view.tsx](src/components/live-round-view.tsx) — shared `LiveRoundView`. Top: leaderboard card recomputed client-side from the optimistic scoreMap, with crown on leader, T-prefixed rank for ties, vs-par color (green<0, red>0), per-row up/down arrow flash (~1.4s CSS keyframe animation) on rank change. Hole-strip nav with three states (idle/filled/current). Big +/− buttons + Par quick-tap per player, optimistic state, `fetchOrQueue` for offline. 30s background poll paused on tab hide. Sticky bottom bar with prev/next hole + "Finish" button (disabled until every roster×hole cell has a score).
- [src/app/rounds/live/[id]/page.tsx](src/app/rounds/live/[id]/page.tsx) + classic/v2 thin wrappers.
- Edited [src/app/api/rounds/[id]/route.ts](src/app/api/rounds/[id]/route.ts) — added `status` to `RoundDetail`.
- Edited [src/app/rounds/[id]/classic-round.tsx](src/app/rounds/[id]/classic-round.tsx) + [v2-round.tsx](src/app/rounds/[id]/v2-round.tsx) — redirect to `/rounds/live/[id]` when `status === 'live'`.

Lint produces the same "set-state-in-effect" warnings as the existing events scorer (the lint rule fires on legit data-loading effects); the codebase already ships with them, so no override added. `npx tsc --noEmit` is clean.

Known follow-up for step 5: bigger UI polish like rank-row "reorder" animation (currently only flash + arrow), score-edits attribution display, and the round detail page links could surface "Continue scoring" instead of plain "Edit" when status='live'. Deferred — not in MVP scope.

## Notes for resuming

- The events scorer at [src/app/events/[id]/score/[roundId]/page.tsx](src/app/events/[id]/score/[roundId]/page.tsx) is the reference — copy its patterns (optimistic overlays, 30s poll, hole-strip, offline queue) and add the leaderboard card on top.
- `hole_scores` snapshot columns (`par`, `handicap_index`, `yardage`) are already populated by `ensureCourseHoles()` from `src/lib/events.ts` — reuse that helper.
- `score_edits` only references `player_id`, not guests. Guest edits can pass `player_id=NULL` on the audit row; the FK on `score_edits.player_id` will need to drop too, or skip audit rows for guest edits. **TBD when implementing step 2.**
- Aggregate `scores` table also has the same player_id/guest_name pattern, so the `/finish` aggregation maps cleanly.
