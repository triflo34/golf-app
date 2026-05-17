-- Course API integration (GolfCourseAPI.com)
-- Adds 3 columns + 1 unique index. Idempotent.
--
-- Run after 2026-05-13-events.sql. Required only because Vercel Prod has
-- SKIP_DB_BOOTSTRAP=1; src/lib/db.ts applies these automatically in dev.

BEGIN;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS external_id     TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ;
ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS yardage INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_external_id
  ON courses(external_id) WHERE external_id IS NOT NULL;

COMMIT;
