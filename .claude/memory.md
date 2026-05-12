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
- Rounds can be created
- Scores partially implemented
- Leaderboard logic exists but may need refinement
- Stats page exists with H2H + player picker

## Data Layer
(Keep updated)
- Database: Postgres via `postgres` library, Supabase Transaction pooler (port 6543)
- Pool: `max: 10`, no `idle_timeout` (was `max: 1` — caused pool starvation under concurrent load)
- All queries have an 8s timeout via `withTimeout` helper in `src/lib/db.ts`
- `SKIP_DB_BOOTSTRAP=1` set in Vercel Production — bootstrap (schema + seed) bypassed there
- Schema changes must be applied manually via Supabase SQL editor while flag is on
- `[db] bootstrap:` per-step logs intact (dormant in prod, activate if env flag unset)

## Known Issues
- Bootstrap root cause never confirmed (which step hangs through Supabase pooler). Bypassed via env flag rather than fixed.

## Recent Changes
- Fixed pool starvation under concurrent load: `max: 1` → `max: 10`, removed `idle_timeout`, added 8s timeout on all queries. (2026-05-12)
- Fixed prod redirect-loop / 504 hang: bypassed DB bootstrap via `SKIP_DB_BOOTSTRAP=1` env flag, added 8s timeout + retry to `ensureInit()`, removed cookie self-destruct in `/api/me`. (2026-05-12)