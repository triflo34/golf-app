-- Course API integration (GolfCourseAPI.com)
-- Adds 3 columns + 1 unique index. Idempotent.
--
-- Run after 2026-05-13-events.sql. Required only because Vercel Prod has
-- SKIP_DB_BOOTSTRAP=1; src/lib/db.ts applies these automatically in dev.


