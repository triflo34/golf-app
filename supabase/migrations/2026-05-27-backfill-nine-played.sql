BEGIN;

-- Handicap Phase 2 — backfill nine_played on legacy 9-hole rounds.
--
-- Before this migration, 9-hole rounds created from the old new-round form
-- didn't capture which nine was played; the handicap math treated NULL as
-- 'front' implicitly. This makes that default explicit in the data so
-- downstream queries don't have to special-case NULL.

UPDATE rounds
   SET nine_played = 'front'
 WHERE hole_count = 9
   AND nine_played IS NULL;

COMMIT;
