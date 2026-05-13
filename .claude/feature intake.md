# Upcoming Features

## 1. Navigation Stability Fix — RESOLVED (2026-05-12)
Root cause: Postgres pool wedging — `max: 1` connection + caching of a hung bootstrap promise. Cookie self-destruct in `/api/me` made the loop visible as a redirect bounce.

Fixes applied:
- Removed cookie self-destruct in `/api/me`
- Added timeout + retry to DB `ensureInit()`
- `SKIP_DB_BOOTSTRAP=1` env flag in Vercel Production (bypasses schema/seed)
- Pool bumped `max: 1` → `max: 10`, removed `idle_timeout`
- 8s timeout on all queries via `withTimeout` helper

---

## 2. Leaderboard Graphs — COMPLETED (2026-05-12)
Add visual graphs for leaderboard performance.

Requirements:
- Show score trends over time
- Compare players visually
- Simple and fast to load
- Do not overcomplicate UI

---

## 3. 9 Hole Round Support — COMPLETED (2026-05-12)
Add ability to track 9 hole rounds.

Rules:
- Must not distort or inflate averages
- Must integrate cleanly with existing 18 hole data
- Maintain consistent scoring logic

---

## 4. Leaderboard Rework (Fairness System) — ON HOLD
Current issue: groups that play more dominate unfairly.
Status: deferred — user wants to decide on approach before implementation.

Goals:
- Normalize leaderboard fairness across group sizes
- Prevent volume bias from dominating standings
- Separate competition contexts:
  - frequent 4 person group
  - smaller 2 person groups

Possible approaches:
- weighted scoring system
- win rate vs total wins
- adjusted leaderboard by participation

---
## 5. Twosome Leaderboard — ON HOLD
Add separate leaderboard support for recurring 2 player groups.
Status: deferred — 9-hole leaderboard toggle already exists; revisit if/when #4 is decided.

Goal:
- prevent smaller groups from distorting global standings
- allow fair competition tracking by group type

## 6. Placement System — COMPLETED (2026-05-12)
Add ranking points for placements.

Examples:
- 1st place = high value
- 2nd place = partial value
- 3rd place = smaller value

Goal:
- Reward consistency, not just wins

---

## 7. Weather Data Integration — COMPLETED (2026-05-13)
- Pull weather data for rounds
- Store conditions with rounds
- Optional display on round history

Provider: Open-Meteo (archive for >5 days old, forecast w/ past_days for recent).
Geocoder: Nominatim (OpenStreetMap), with 1.1s pacing + 429 retry.
Save flow: `after()`-scheduled `populateRoundWeather` on POST and PUT (PUT only re-fetches when course_id or played_at changed).
Backfill: `/api/admin/backfill-weather` (admin-gated, batched 25, looped from admin UI).
UI: weather strip on round detail; custom tooltip on leaderboard Score Trends chart.

---

## 8. USGA Handicap MCP Integration (ADVANCED)
- Integrate official handicap calculation logic
- Possibly via MCP server
- Ensure accurate golf handicap computation
- Sync with rounds automatically