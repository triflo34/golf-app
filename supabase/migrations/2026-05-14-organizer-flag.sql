-- Split event_participants.role into role='player' for everyone + an
-- is_organizer boolean flag. Lets organizers also score as players.
-- Idempotent.

BEGIN;

ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS is_organizer BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: anyone previously role='organizer' becomes is_organizer=true,
-- and their role is normalized to 'player' so every participant is in the
-- player list by default.
UPDATE event_participants
  SET is_organizer = TRUE
  WHERE role = 'organizer' AND is_organizer = FALSE;

UPDATE event_participants
  SET role = 'player'
  WHERE role = 'organizer';

COMMIT;
