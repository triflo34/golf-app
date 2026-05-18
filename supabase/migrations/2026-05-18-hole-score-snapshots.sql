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
UPDATE hole_scores hs
  SET par            = ch.par,
      handicap_index = ch.handicap_index,
      yardage        = ch.yardage
  FROM rounds r
  JOIN course_holes ch
    ON ch.course_id = r.course_id AND ch.hole_number = hs.hole_number
  WHERE hs.round_id = r.id
    AND (hs.par IS NULL OR hs.handicap_index IS NULL OR hs.yardage IS NULL);

UPDATE team_hole_scores ths
  SET par            = ch.par,
      handicap_index = ch.handicap_index,
      yardage        = ch.yardage
  FROM scramble_teams st
  JOIN rounds r ON r.id = st.round_id
  JOIN course_holes ch
    ON ch.course_id = r.course_id AND ch.hole_number = ths.hole_number
  WHERE ths.team_id = st.id
    AND (ths.par IS NULL OR ths.handicap_index IS NULL OR ths.yardage IS NULL);

COMMIT;
