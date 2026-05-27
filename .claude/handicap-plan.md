# Handicap & Fair-Match Plan

Source spec: chat-pasted "Golf App Feature Plan — Fair Matches, Handicaps, and Smart Game Building" (2026-05-26 session).
Phase 1 first slice (per user decision):
- Compute each player's USGA-style handicap index and surface it on the profile pages.
- Show each player's course handicap on the new-round flow once a course is chosen.
- 9-hole rounds: store per-course 9-hole rating/slope + per-round nine-played, compute proper 9-hole differentials.

## Progress

Last updated: 2026-05-26

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

**In progress:** _none — Phase 1 first slice complete._

**Pending (deferred):**
- Round edit path (`/rounds/[id]/edit`) doesn't yet round-trip `nine_played`; legacy 9-hole rounds default to front-9 in the math
- Scorecard upload form doesn't yet capture `nine_played`
- See "Deferred to Phase 2+" below for the bigger items.

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

## Deferred to Phase 2+

- Stroke allocation visualization on the scorecard (per-hole strokes-received indicator)
- Team-balancing engine / Fair Match Builder
- Scramble weighted handicap (25/20/15/10)
- Fairness score + match recommendations
- Backfill of historical 9-hole rounds' `nine_played` (leave NULL → treat as front-9 by default)
