-- Golfapalooza event module
-- Adds 13 new tables + 4 columns + 2 CHECK constraints to `rounds`.
--
-- Idempotent: safe to run multiple times (uses IF NOT EXISTS / guarded constraints).
-- Required only because Vercel Prod has SKIP_DB_BOOTSTRAP=1 set, which prevents
-- src/lib/db.ts from auto-applying the inline schema. After running this once,
-- you can leave SKIP_DB_BOOTSTRAP=1 set.
--
-- How to run:
--   1. Supabase SQL Editor: paste this entire file, run.
--   2. psql:  psql "$DATABASE_URL" -f supabase/migrations/2026-05-13-events.sql

BEGIN;

-- ===== New tables =====

CREATE TABLE IF NOT EXISTS events (
  id                       SERIAL PRIMARY KEY,
  name                     TEXT NOT NULL,
  course_id                INTEGER NOT NULL REFERENCES courses(id),
  start_date               DATE NOT NULL,
  end_date                 DATE NOT NULL,
  entry_fee_cents          INTEGER NOT NULL DEFAULT 0,
  description              TEXT,
  status                   TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','open','in_progress','completed','archived')),
  exclude_from_leaderboard BOOLEAN NOT NULL DEFAULT FALSE,
  created_by               TEXT NOT NULL REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL CHECK (role IN ('organizer','player')),
  group_num  SMALLINT,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_participants_user ON event_participants(user_id);

CREATE TABLE IF NOT EXISTS course_holes (
  course_id      INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  hole_number    SMALLINT NOT NULL,
  par            SMALLINT NOT NULL,
  handicap_index SMALLINT,
  PRIMARY KEY (course_id, hole_number)
);

CREATE TABLE IF NOT EXISTS hole_scores (
  id          SERIAL PRIMARY KEY,
  round_id    INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES users(id),
  hole_number SMALLINT NOT NULL,
  strokes     SMALLINT NOT NULL,
  updated_by  TEXT REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id, hole_number)
);
CREATE INDEX IF NOT EXISTS idx_hole_scores_round ON hole_scores(round_id);

CREATE TABLE IF NOT EXISTS score_edits (
  id            SERIAL PRIMARY KEY,
  hole_score_id INTEGER REFERENCES hole_scores(id) ON DELETE SET NULL,
  round_id      INTEGER NOT NULL,
  player_id     TEXT NOT NULL,
  hole_number   SMALLINT NOT NULL,
  old_strokes   SMALLINT,
  new_strokes   SMALLINT,
  edited_by     TEXT NOT NULL REFERENCES users(id),
  edited_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_edits_round ON score_edits(round_id);

CREATE TABLE IF NOT EXISTS scramble_teams (
  id        SERIAL PRIMARY KEY,
  round_id  INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  name      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scramble_team_members (
  team_id  INTEGER NOT NULL REFERENCES scramble_teams(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_hole_scores (
  id          SERIAL PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES scramble_teams(id) ON DELETE CASCADE,
  hole_number SMALLINT NOT NULL,
  strokes     SMALLINT NOT NULL,
  updated_by  TEXT REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, hole_number)
);
CREATE INDEX IF NOT EXISTS idx_team_hole_scores_team ON team_hole_scores(team_id);

CREATE TABLE IF NOT EXISTS side_games (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL
              CHECK (kind IN ('poker','best18','worst18','most_same','scramble_winners')),
  pot_cents  INTEGER NOT NULL DEFAULT 0,
  config     JSONB,
  UNIQUE (event_id, kind)
);

CREATE TABLE IF NOT EXISTS side_game_results (
  id            SERIAL PRIMARY KEY,
  side_game_id  INTEGER NOT NULL REFERENCES side_games(id) ON DELETE CASCADE,
  player_id     TEXT REFERENCES users(id),
  team_id       INTEGER REFERENCES scramble_teams(id),
  rank          SMALLINT,
  payout_cents  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poker_hands (
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES users(id),
  cards       JSONB NOT NULL DEFAULT '[]'::jsonb,
  wild_count  SMALLINT NOT NULL DEFAULT 0,
  bogey_count SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, player_id)
);

CREATE TABLE IF NOT EXISTS poker_deck_state (
  event_id   INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  num_decks  SMALLINT NOT NULL DEFAULT 1,
  drawn      JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS poker_swap_queue (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES users(id),
  incoming_card JSONB,
  delta         SMALLINT NOT NULL DEFAULT 1,
  resolved_at   TIMESTAMPTZ,
  swapped_card  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poker_swap_pending
  ON poker_swap_queue(event_id, player_id) WHERE resolved_at IS NULL;

-- ===== Modify `rounds` to support events =====

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS event_id     INTEGER REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'total';
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS round_number SMALLINT;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS round_format TEXT NOT NULL DEFAULT 'individual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rounds_scoring_mode_check'
  ) THEN
    ALTER TABLE rounds
      ADD CONSTRAINT rounds_scoring_mode_check
      CHECK (scoring_mode IN ('total','hole_by_hole'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rounds_round_format_check'
  ) THEN
    ALTER TABLE rounds
      ADD CONSTRAINT rounds_round_format_check
      CHECK (round_format IN ('individual','scramble'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_rounds_event ON rounds(event_id);

COMMIT;
