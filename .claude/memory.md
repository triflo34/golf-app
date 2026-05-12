# Golf App Project Memory

## Purpose
Social golf leaderboard app for tracking rounds, scores, and friendly competition. main client is using a phone not a computer but both should be accepted

## Core Features
- User auth and profiles
- Round creation and score entry
- Leaderboards across users and groups
- Basic player stats

## Current State
(Updated after every meaningful change)
- Auth working (prod redirect-loop / 504 hang fixed, survives concurrent spam-click)
- Rounds can be created — now supports 9- or 18-hole (per-round, defaults from course, user can override)
- Scores partially implemented
- Leaderboard: 18/9/All holes toggle, season + scope (mine/everyone) toggles, Score Trends line chart, placement points (linear N..1) + 1st/2nd/3rd counts + wins columns
- Stats page exists with H2H + player picker

## Data Layer
(Keep updated)
- Database: Postgres via `postgres` library, Supabase Transaction pooler (port 6543)
- Pool: `max: 10`, no `idle_timeout` (was `max: 1` — caused pool starvation under concurrent load)
- All queries have an 8s timeout via `withTimeout` helper in `src/lib/db.ts`
- `SKIP_DB_BOOTSTRAP=1` set in Vercel Production — bootstrap (schema + seed) bypassed there
- Schema changes must be applied manually via Supabase SQL editor while flag is on
- `[db] bootstrap:` per-step logs intact (dormant in prod, activate if env flag unset)
- `rounds.hole_count` SMALLINT (9 or 18) CHECK constraint, default 18. `ensureHoleCountColumn` self-migrates locally; prod was migrated via Supabase SQL editor (2026-05-12).

## Known Issues
- Bootstrap root cause never confirmed (which step hangs through Supabase pooler). Bypassed via env flag rather than fixed.

## Recent Changes
- Added 9-hole round support + placement points (2026-05-12):
  - Schema: `rounds.hole_count SMALLINT NOT NULL DEFAULT 18 CHECK (hole_count IN (9,18))`. `ensureHoleCountColumn` runs in dev bootstrap; prod requires manual SQL (see below).
  - Round form: 9/18 segmented toggle, pre-fills from course but user can override per round. Score min validation switches to 9 for 9-hole rounds.
  - APIs: `POST/PUT /api/rounds` validate and persist `hole_count`; `GET /api/rounds/[id]` returns it; round detail page shows a "9 holes" badge.
  - Leaderboard API: `?holes=18|9|all` filter (default 18). Adds placement loop with competition ranking (ties share rank, next rank skipped) and linear points `N - rank + 1`. New fields: `points`, `firsts`, `seconds`, `thirds`. Solo rounds (N<2) still don't award points or wins.
  - Leaderboard page: holes toggle next to scope toggle; row meta now shows `rounds · wins · best`, place-count chips (1st/2nd/3rd) below name when any > 0, and a Points column on the right replacing the previous Best column.
  - Prod ALTER applied via Supabase SQL editor (idempotent block in `db.ts` mirrors it).
- Added Score Trends line chart on leaderboard page (Recharts) — per-player gross-score-over-time, all ranked players, respects season + scope toggles. Extended `/api/leaderboard` to include `series` per player. New component `src/components/score-trend-chart.tsx`. (2026-05-12)
- Fixed pool starvation under concurrent load: `max: 1` → `max: 10`, removed `idle_timeout`, added 8s timeout on all queries. (2026-05-12)
- Fixed prod redirect-loop / 504 hang: bypassed DB bootstrap via `SKIP_DB_BOOTSTRAP=1` env flag, added 8s timeout + retry to `ensureInit()`, removed cookie self-destruct in `/api/me`. (2026-05-12)