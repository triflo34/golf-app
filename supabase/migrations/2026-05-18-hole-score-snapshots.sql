BEGIN;

-- Snapshot par + handicap + yardage onto each per-hole score so historical
-- rounds keep their vs-par/handicap accuracy even if a course is re-linked
-- or refreshed later. Idempotent.
ALTER TABLE hole_scores      ADD COLUMN IF NOT EXISTS par            SMALLINT;
ALTER TABLE hole_scores      ADD COLUMN IF NOT EXISTS handicap_index SMALLINT;
ALTER TABLE hole_scores      ADD COLUMN IF NOT EXISTS yardage        INTEGER;
ALTER TABLE team_hole_scores ADD COLUMN IF NOT EXISTS par            SMALLINT;
ALTER TABLE team_hole_scores ADD COLUMN IF NOT EXISTS handicap_index SMALLINT;
ALTER TABLE team_hole_scores ADD COLUMN IF NOT EXISTS yardage        INTEGER;

-- Backfill any existing rows from current course_holes. Idempotent: only
-- writes columns that are still NULL.
--
-- Note: Postgres UPDATE…FROM does not let JOIN ON clauses reference the
-- UPDATE target. All joins involving `hs` / `ths` must live in WHERE.
UPDATE hole_scores hs
  SET par            = ch.par,
      handicap_index = ch.handicap_index,
      yardage        = ch.yardage
  FROM rounds r, course_holes ch
  WHERE hs.round_id = r.id
    AND ch.course_id = r.course_id
    AND ch.hole_number = hs.hole_number
    AND (hs.par IS NULL OR hs.handicap_index IS NULL OR hs.yardage IS NULL);

UPDATE team_hole_scores ths
  SET par            = ch.par,
      handicap_index = ch.handicap_index,
      yardage        = ch.yardage
  FROM scramble_teams st, rounds r, course_holes ch
  WHERE ths.team_id = st.id
    AND r.id = st.round_id
    AND ch.course_id = r.course_id
    AND ch.hole_number = ths.hole_number
    AND (ths.par IS NULL OR ths.handicap_index IS NULL OR ths.yardage IS NULL);

COMMIT;
