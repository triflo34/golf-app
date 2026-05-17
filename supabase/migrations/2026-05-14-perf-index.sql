-- Perf: missing index on scramble_teams.round_id
-- Used by standings.ts when fanning out team scores onto event members.
-- Idempotent.

CREATE INDEX IF NOT EXISTS idx_scramble_teams_round ON scramble_teams(round_id);
