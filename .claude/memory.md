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
- Leaderboard: 18/9/All holes toggle, season + scope (mine/everyone) toggles, Score Trends line chart (custom tooltip shows weather), placement points (linear N..1) + 1st/2nd/3rd counts + wins columns
- Stats page exists with H2H + player picker
- Weather captured per round (Open-Meteo + Nominatim) and displayed on round detail + chart tooltip; admin backfill button at /admin

## Data Layer
(Keep updated)
- Database: Postgres via `postgres` library, Supabase Transaction pooler (port 6543)
- Pool: `max: 10`, no `idle_timeout` (was `max: 1` — caused pool starvation under concurrent load)
- All queries have an 8s timeout via `withTimeout` helper in `src/lib/db.ts`
- `SKIP_DB_BOOTSTRAP=1` set in Vercel Production — bootstrap (schema + seed) bypassed there
- Schema changes must be applied manually via Supabase SQL editor while flag is on
- `[db] bootstrap:` per-step logs intact (dormant in prod, activate if env flag unset)
- `rounds.hole_count` SMALLINT (9 or 18) CHECK constraint, default 18. `ensureHoleCountColumn` self-migrates locally; prod was migrated via Supabase SQL editor (2026-05-12).
- `courses.latitude/longitude` DOUBLE PRECISION (nullable) — populated lazily by Nominatim on first round at that course. `ensureCourseGeoColumns` self-migrates.
- `rounds.temp_high_f/temp_low_f/wind_max_mph/precip_in` REAL, `weather_code` SMALLINT, `weather_fetched_at` TIMESTAMPTZ — populated via Open-Meteo. `ensureRoundWeatherColumns` self-migrates. Same schema applied to prod via Supabase SQL editor (2026-05-13).

## Known Issues
- Bootstrap root cause never confirmed (which step hangs through Supabase pooler). Bypassed via env flag rather than fixed.

## Recent Changes
- Added weather integration (2026-05-13):
  - Schema: `courses.latitude/longitude` and `rounds.temp_high_f/temp_low_f/wind_max_mph/precip_in/weather_code/weather_fetched_at`. Self-migrating helpers in `db.ts`; prod ALTERs run via Supabase SQL editor.
  - New `src/lib/weather.ts` (server): `geocodeCourse` (Nominatim, structured then free-text, 1.1s pacing + 429 retry), `fetchRoundWeather` (Open-Meteo archive for >5d old, forecast w/ past_days for recent), `populateRoundWeather` (full pipeline, idempotent on `weather_fetched_at`).
  - New `src/lib/weather-labels.ts` — pure `wmoLabel` mapping, safe for client bundles (split out to avoid pulling `postgres` into the browser).
  - POST `/api/rounds` and PUT `/api/rounds/[id]` schedule `populateRoundWeather` via Next 16 `after()`; PUT clears stale weather + re-fetches only when course/date change.
  - New `POST /api/admin/backfill-weather` (admin-gated, batched 25, `maxDuration=60`, 1.1s/round Nominatim pacing) + "Backfill weather" button on `/admin` that loops until `remaining=0`.
  - UI: `WeatherStrip` on round detail page; custom `WeatherTooltip` on `ScoreTrendChart` showing per-round condition + hi/lo + wind + precip. `RoundDetail.weather` and `SeriesPoint` extended to carry weather fields.
- Added 9-hole round support + placement points (2026-05-12):
  - Schema: `rounds.hole_count SMALLINT NOT NULL DEFAULT 18 CHECK (hole_count IN (9,18))`. `ensureHoleCountColumn` runs in dev bootstrap; prod requires manual SQL (see below).
  - Round form: 9/18 segmented toggle, pre-fills from course but user can override per round. Score min validation switches to 9 for 9-hole rounds.
  - APIs: `POST/PUT /api/rounds` validate and persist `hole_count`; `GET /api/rounds/[id]` returns it; round detail page shows a "9 holes" badge.
  - Leaderboard API: `?holes=18|9|all` filter (default 18). Adds placement loop with competition ranking (ties share rank, next rank skipped) and linear points `N - rank + 1`. New fields: `points`, `firsts`, `seconds`, `thirds`. Solo rounds (N<2) still don't award points or wins.
  - Leaderboard page: holes toggle next to scope toggle; row meta now shows `rounds · wins · best`, place-count chips (1st/2nd/3rd/4th) below name when any > 0, and a Points column on the right replacing the previous Best column. Tied finishes annotated inline as `(Nt)` per place; API exposes `*_tied` counts. Default sort = points desc → avg asc → best asc.
  - Score Trend chart: in-chart Scores/Points/Place metric toggle. `SeriesPoint` now carries `gross_score`, `points`, `rank` per round (solo rounds get null points/rank but still chart their score). Y axis reverses for Place so rank 1 sits at top.
  - Prod ALTER applied via Supabase SQL editor (idempotent block in `db.ts` mirrors it).
- Added Score Trends line chart on leaderboard page (Recharts) — per-player gross-score-over-time, all ranked players, respects season + scope toggles. Extended `/api/leaderboard` to include `series` per player. New component `src/components/score-trend-chart.tsx`. (2026-05-12)
- Fixed pool starvation under concurrent load: `max: 1` → `max: 10`, removed `idle_timeout`, added 8s timeout on all queries. (2026-05-12)
- Fixed prod redirect-loop / 504 hang: bypassed DB bootstrap via `SKIP_DB_BOOTSTRAP=1` env flag, added 8s timeout + retry to `ensureInit()`, removed cookie self-destruct in `/api/me`. (2026-05-12)