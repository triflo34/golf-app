# Handicap & Fair-Match Plan

Source spec: chat-pasted "Golf App Feature Plan — Fair Matches, Handicaps, and Smart Game Building" (2026-05-26 session).
Phase 1 first slice (per user decision):
- Compute each player's USGA-style handicap index and surface it on the profile pages.
- Show each player's course handicap on the new-round flow once a course is chosen.
- 9-hole rounds: store per-course 9-hole rating/slope + per-round nine-played, compute proper 9-hole differentials.

Phase 2 first slice (per user decision, 2026-05-27):
- Fair Match Builder full stack: pick players + course + format + team sizes, get top 5 balanced team suggestions ranked by fairness.
- Scramble weighted handicap for 2/3/4-player teams (35/15, 30/20/10, 25/20/15/10).
- New page `/matches/build`, linked from rounds/new on both classic + v2.
- Backfill legacy 9-hole rounds' `nine_played` to 'front' (matches the implicit math default).

## Progress

Last updated: 2026-05-27

**Done:**
- Plan written
- Schema: `courses` gained `front_9_rating`, `front_9_slope`, `back_9_rating`, `back_9_slope` (REAL nullable); `rounds` gained `nine_played` TEXT with CHECK (`'front'|'back'|NULL`). Added `ensureCourseNineHoleRatingColumns()` + `ensureRoundsNinePlayedColumn()` in `src/lib/db.ts` and mirrored in `supabase/migrations/2026-05-26-handicap-9hole.sql` (prod runs `SKIP_DB_BOOTSTRAP=1` — must be applied manually in Supabase SQL editor)
- `src/lib/handicap.ts` rewritten: `RoundForHandicap` now carries `hole_count` + per-nine ratings; 9-hole differentials use the matching nine's rating/slope then *2 to express as 18-hole-equivalent; rounds missing the rating they need are skipped (not faked). `calculateHandicapIndex` returns `{ index, rounds_used, rounds_skipped }`. `calculateCourseHandicap` + new `calculateNetScore` signature handle 9 vs 18.
- `src/lib/player-handicap.ts` (new): `getPlayerHandicapIndex(userId)`, `getPlayerHandicapIndexes(userIds)`, `getCourseHandicapForIndex(...)` — joins `scores` → `rounds` → `courses`, picks correct rating/slope per row, defaults legacy 9-hole rounds (NULL `nine_played`) to front-9.
- `/api/me` now returns `{ user, handicap }`; `/api/player` adds `handicap_index` + `handicap_rounds_used`. Guests get null (no stable identity).
- `Course` type in `src/lib/types.ts` gained the 4 new rating cols (course-detail route already used `SELECT *`).
- New `GET /api/courses/[id]/handicaps?user_ids=&hole_count=&nine_played=` returns per-user `{ handicap_index, course_handicap, rounds_used }`.
- New `PATCH /api/admin/courses/[id]/ratings` (admin-only) accepts 18-hole + per-nine ratings/slopes; validates ranges; null/empty clears.
- Profile UI: classic + v2 profile pages render a handicap-index headline above the stats grid with "Need N more rounds" fallback when `index` is null.
- Round create: `POST /api/rounds` accepts optional `nine_played` and persists it (forced to NULL for 18-hole rounds). `RoundForm` adds a Front 9/Back 9 toggle when 9 holes selected, fetches handicaps from the new endpoint when course + user players + format change, and renders `HC X · course Y` under each registered player's name.
- Course edit page (`/courses/[id]/edit-holes`) gained a "Course ratings" card above the per-hole table with 18-hole + Front 9 + Back 9 rating/slope inputs, saving via the new admin ratings endpoint.
- Type check: `npx tsc --noEmit` clean. Build: `next build` registers `/api/courses/[id]/handicaps` and `/api/admin/courses/[id]/ratings`.

**Phase 2 done (2026-05-27):**
- `src/lib/handicap.ts`: added `calculateScrambleHandicap` (weights 35/15, 30/20/10, 25/20/15/10), `calculateTeamHandicap(courseHandicaps, format)`, `calculateFairnessDelta(teamHandicaps)`, plus `MatchFormat` union (`scramble | best_ball | individual`). Scramble rounds to integer; non-scramble keeps one decimal of precision so fairness ranking is stable.
- `src/lib/match-builder.ts` (new): `buildTwoTeamArrangements(players, format, aSize, topN)` enumerates C(n, aSize) partitions, dedupes mirrors for equal splits, returns top-N by fairness delta. Combinatorial generator is iterative — no recursion.
- New page `/matches/build` (`src/app/matches/build/page.tsx` + `match-builder.tsx`): course picker (local DB), 18/9 + Front/Back toggle, player multi-select (registered users only — guests have no index), format pills, team-size pills (1 v N-1 ... N-1 v 1), and a results section rendering top 5 arrangements with team HCs + fairness delta + per-player course HC chips. Uses `GET /api/courses/[id]/handicaps` to resolve course handicaps client-side; pure compute runs in `useMemo`.
- Builder linked from both classic + v2 `rounds/new` pages as a card above the type/scorecard toggle.
- DB backfill: `ensureRoundsNinePlayedColumn` now also runs `UPDATE rounds SET nine_played='front' WHERE hole_count=9 AND nine_played IS NULL`. Mirror migration in `supabase/migrations/2026-05-27-backfill-nine-played.sql` (prod runs `SKIP_DB_BOOTSTRAP=1`, so apply manually in Supabase SQL editor).
- Type check: `npx tsc --noEmit` clean.

**Phase 2 round 2 done (2026-05-28):**
- Match Builder: 3+ team partitioning. New `buildMultiTeamArrangements(players, format, teamSizes, topN)` + `balancedTeamSizes(n, k)`. UI: "Number of teams" pill row (2/3/4 capped by player count); 2-team mode keeps custom sizes, 3+ auto-balances. Suggestion cards render K teams responsively, name the scratch team (lowest HC), and list per-team strokes given relative to it with allowance applied.
- Match Builder: guest support — mixed entries list (registered users + guests with manually-entered course HC) feeds the same scramble/best-ball/individual math.
- Match Builder: handicap allowance pills (100% / 95% / 90% / 85%) backed by USGA recommendations; default tracks format but stays sticky once user picks.
- Round edit (`/rounds/[id]/edit`, v2 + classic) now round-trips `nine_played` for both Type-scores (`RoundForm`) and Scorecard (`ScorecardRoundForm`) paths. API: `/api/rounds/[id]` GET returns `nine_played`; PUT accepts and persists it (forces null when `hole_count != 9`).
- Scorecard upload (`ScorecardRoundForm`, used by both new-round and edit-round): added Front 9/Back 9 toggle when 9-hole selected; `nine_played` in `ScorecardPayload`; `/api/rounds/scorecard` POST accepts and persists it.

**In progress:** _none — Phase 2 second slice complete._

**Pending (deferred):**
- Phase 2 leftover: stroke allocation visualization on the scorecard (per-hole strokes-received indicator). Math already exists (course HC + `course_holes.handicap_index`), needs a UI pass.
- Show which actual hole numbers the strokes fall on in the Match Builder suggestions (uses `course_holes.handicap_index` ≤ N).

## Phase 1 checklist

1. **Schema**
   - [x] `courses`: add `front_9_rating REAL`, `front_9_slope REAL`, `back_9_rating REAL`, `back_9_slope REAL`
   - [x] `rounds`: add `nine_played TEXT CHECK (nine_played IN ('front','back'))` (nullable; only set when `hole_count = 9`)
   - [x] Update `SCHEMA_SQL` in `src/lib/db.ts` and add an `ensure*` migration helper
   - [x] Mirror migration in `supabase/migrations/2026-05-26-handicap-9hole.sql` (prod uses `SKIP_DB_BOOTSTRAP=1`)

2. **Handicap library (`src/lib/handicap.ts`)**
   - [x] Extend `RoundForHandicap` to include `hole_count` (9|18) and optional 9-hole rating/slope
   - [x] For 9-hole rounds: differential = `((score - rating9) * 113) / slope9` then *2 to express as 18-hole-equivalent
   - [x] Filter input rounds: drop any round missing the rating/slope it needs
   - [x] Keep best-N-of-last-20 logic; return `{ index, rounds_used, rounds_skipped }`

3. **Server helper**
   - [x] `getPlayerHandicapIndex(userId)` in `src/lib/player-handicap.ts`
   - [x] `getPlayerHandicapIndexes(userIds)` batch helper
   - [x] `calculateCourseHandicap(handicapIndex, course, holeCount, ninePlayed)` returns rounded course handicap (in handicap.ts)

4. **APIs**
   - [x] `/api/me`: includes `handicap` `{ index, rounds_used, rounds_skipped }`
   - [x] `/api/player`: includes `handicap_index` + `handicap_rounds_used`
   - [x] `Course` type updated to include 4 new rating cols (route already used `SELECT *`)
   - [x] New: `GET /api/courses/[id]/handicaps?user_ids=&hole_count=&nine_played=` → `{ by_user_id: { handicap_index, course_handicap, rounds_used } }`
   - [x] New: `PATCH /api/admin/courses/[id]/ratings` (admin-only, range-validated)
   - [x] `POST /api/rounds` accepts + stores `nine_played`

5. **UI: profile**
   - [x] Classic + v2 profile pages render handicap-index badge near the top with "Need N more rounds" placeholder

6. **UI: new round**
   - [x] `RoundForm` (shared by classic + v2): Front 9/Back 9 toggle when 9 holes selected
   - [x] After course + players chosen, renders `HC X · course Y` per registered player
   - [x] Course missing rating shows `course —` with the index still visible

7. **UI: course edit**
   - [x] "Course ratings" card on `/courses/[id]/edit-holes` with 18-hole + Front 9 + Back 9 inputs

## Phase 2 checklist

1. **Scramble + fairness math (`src/lib/handicap.ts`)**
   - [x] `calculateScrambleHandicap(courseHandicaps[])` — USGA weights for team sizes 1–4
   - [x] `calculateTeamHandicap(courseHandicaps[], format)` — scramble weighted, others averaged
   - [x] `calculateFairnessDelta(teamHandicaps[])` — max − min
   - [x] `MatchFormat` union exported

2. **Team-balancer engine (`src/lib/match-builder.ts`)**
   - [x] Iterative C(n,k) combination generator
   - [x] `buildTwoTeamArrangements(players, format, aSize, topN)` — equal-split mirror dedup
   - [x] Returns `{ teams, team_handicaps, fairness_delta }` sorted ascending by delta

3. **UI: Match Builder page**
   - [x] `/matches/build` page, mode-aware (classic + v2)
   - [x] Course picker, hole-count + nine-played toggle
   - [x] Multi-select for registered users (max 8), guest exclusion
   - [x] Format pills (scramble / best ball / individual)
   - [x] Team-size pills (1 v N-1 ... balanced default)
   - [x] Fetches `/api/courses/[id]/handicaps`, computes arrangements client-side
   - [x] Renders top 5 with team HC, fairness delta, per-player chips
   - [x] Surfaces players missing a handicap (3-round threshold)

4. **Discoverability**
   - [x] Card on classic + v2 `rounds/new` linking to `/matches/build`

5. **Data backfill**
   - [x] `ensureRoundsNinePlayedColumn` sets legacy 9-hole rounds' `nine_played` to 'front'
   - [x] Mirror migration `2026-05-27-backfill-nine-played.sql` for prod

## Deferred to Phase 3+

- Stroke allocation visualization on the scorecard (per-hole strokes-received indicator)
- 3+ team partitioning in the Match Builder (currently 2 teams only)
- Round edit path round-tripping `nine_played`; scorecard upload capturing `nine_played`
