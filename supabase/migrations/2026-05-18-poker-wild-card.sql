BEGIN;

-- Shared community wild card per event: a real card from the deck that all
-- players use as a 6th card when judging hands. Re-rolls each time anyone
-- scores a birdie or eagle. NULL until the event is started (or until poker
-- isn't enabled for the event).
ALTER TABLE poker_deck_state
  ADD COLUMN IF NOT EXISTS wild_card JSONB;

COMMIT;
