BEGIN;

-- Handicap Phase 1 — add 9-hole rating/slope per course and per-round
-- "which nine" tracking so 9-hole rounds can produce valid USGA-style
-- differentials.
--
-- 18-hole rating/slope (course_rating, slope_rating) already exists.
-- New cols are nullable: a course without 9-hole ratings simply has its
-- 9-hole rounds skipped when computing each player's handicap index.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS front_9_rating REAL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS front_9_slope  REAL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS back_9_rating  REAL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS back_9_slope   REAL;

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS nine_played TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rounds_nine_played_check'
  ) THEN
    ALTER TABLE rounds
      ADD CONSTRAINT rounds_nine_played_check
      CHECK (nine_played IS NULL OR nine_played IN ('front','back'));
  END IF;
END$$;

COMMIT;
