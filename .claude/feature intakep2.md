# Golfapalooza Event Module - Feature Specification

## Overview
Create a flexible "Golfapalooza" (or Custom Golf Event) module that supports the 2025 Memorial Weekend format and similar group events.

The system must be highly configurable for side games and have clear participant management with proper notification and viewing controls.

The experience should feel social, competitive, and easy to run for paid golf outings.

---

# Core Goals

- Highly configurable side games and pots.
- Support two 18-hole rounds (regular + scramble).
- Proper participant management with privacy and notification controls.
- Real-time scoring and standings.
- Easy event setup and payout management.
- Strong distinction between active participants and spectators.

---

# Suggested Core Entities

- Event
- EventParticipant
- EventRound
- HoleScore
- SideGame
- SideGameEntry
- Notification
- SpectatorFollow
- Payout
- ScrambleTeam

---

# Roles

## Organizer
- Can create/edit event settings.
- Can invite/select players.
- Can start/lock event.
- Can edit scores.
- Can finalize payouts.
- Can enable/disable side games.
- Can resolve disputes.

## Active Player
- Can submit scores.
- Participates in enabled side games.
- Receives notifications and live updates.
- Can view live standings and side game progress.

## Spectator
- Read-only access.
- Can follow/watch events.
- Can view live scores and standings.
- Does not receive notifications.
- Cannot affect scoring, pots, or side games.

---

# Event Status States

## Draft
- Organizer configuring event.
- Players may still be added/removed.

## Open
- Event visible and joinable.
- Side games configurable.

## In Progress
- Player list locked.
- Live scoring enabled.
- Notifications active.

## Completed
- Scores finalized.
- Payouts calculated.

## Archived
- Historical view only.
- No further edits allowed.

---

# Event Setup

- Event name
  - Example: "Memorial Weekend Golfapalooza"

- Date & location

- Entry fee per player
  - Recommended in $5 increments.

- Total pot tracking
  - Auto-calculated from entry fees + enabled side games.

- Event rules / description section.

- Side game configuration.

- Scramble configuration.

- Optional leaderboard exclusion toggle:
  - "Opt this event/round out of overall leaderboard & handicap tracking."

---

# Participant Management

## Active Players
- Organizer selects official players at event setup.
- Only confirmed players are considered active participants.
- Only active participants:
  - Receive notifications.
  - Participate in side games.
  - Affect payouts and standings.

## Event Locking
- Organizer can mark event as:
  - Started
  - In Progress

Once started:
- Player list locks.
- Side game configuration locks.
- Entry fees lock.

---

# Participant & Viewing Rules

## Active Players
- Receive:
  - Score update notifications.
  - Side game notifications.
  - Poker card updates.
  - Leaderboard changes.

## Spectator / Stalker Mode
Other app users may:
- Watch/follow an event.
- View live scores.
- View side game standings.
- View leaderboards.

Spectators:
- Do NOT receive notifications.
- Cannot submit scores.
- Cannot participate in side games.
- Cannot affect pots or standings.

## UI Requirements
- Clear visual distinction between:
  - Organizer
  - Active Players
  - Spectators

- Separate tabs/views for:
  - Live Play
  - Spectator Mode
  - Side Games
  - Rules
  - Payouts

---

# Groups / Tee Times

- Organizer can assign players into groups/foursomes.
- Players may be grouped by tee time.
- Live scoring views should support grouped displays.
- Push notifications may optionally prioritize a player’s group.

---

# Scoring Requirements

## Standard Round Scoring
- Hole-by-hole score entry.
- Easy marking of:
  - Pars
  - Birdies
  - Bogeys
  - Double bogeys
  - Eagles

## Scramble Support
- Organizer can manually create scramble teams.
- Team scores tracked separately from individual scores.
- Scramble rounds may optionally count toward:
  - Side games
  - Event standings

## Leaderboard Exclusion
Optional toggle:
- "Opt this round out of overall leaderboard/handicap."

When enabled:
- Scores do NOT affect:
  - Main app handicap
  - Seasonal rankings
  - Career statistics

---

# Closest to the Pin

- Manual entry only.
- Human verification required.
- Configurable by:
  - Hole
  - Round
  - Amount

## Nice-to-Have
- Photo upload support for claims.

---

# Side Games / Contests

Side games should be modular and configurable.

Organizer selects:
- Which games are enabled.
- Pot amounts for each.

---

## Poker

### Rules
- 1 card per par.
- 1 card every 2 bogeys.
- Birdie:
  - Draw 2 cards.
  - Receive 1 wild card.
- Max 5 cards.
- 5 of a kind allowed.

### UI
- Show card count for all active players.
- Optional visual playing card graphics for personal hand.

### MVP
- Manual poker hand winner selection allowed.

---

## 3-Man Scramble Winners
- Configurable team payout splitting.
- Example:
  - $10 per team member.

---

## Closest to the Pin
- Configurable per hole.
- Configurable payout amount.

---

## Best 18
- Best 9 from round 1.
- Best 9 from round 2.

---

## Worst 18
- Worst 9 from round 1.
- Worst 9 from round 2.

---

## Most "Same" Number
- Most repeated score in first 18 holes.
- Scores do not need to be consecutive.

---

# Live Scoring

## High Priority Nice-to-Have

- Real-time score updates during play.
- Active players see live updates immediately.
- Spectators can follow live scoring in read-only mode.
- Live leaderboard updates.
- Live side game standings.

---

# Connectivity Requirements

Golf courses often have weak cellular service.

The system should:
- Support temporary offline score entry.
- Queue pending updates locally.
- Auto-sync scores when connection returns.
- Prevent duplicate submissions during reconnects.

---

# Score Verification & Anti-Cheat

- Scores may optionally require confirmation from another player.
- Organizer can override disputed scores.
- Edit history should be stored for score changes.
- Finalized rounds should lock edits unless reopened by organizer.

---

# Additional Features

- Event-specific leaderboard.
- Built-in customizable Rules viewer.
- Live pot tracking.
- Side game standings.
- Final payout summary screen.
- Push notifications for active players only.
- Event photo uploads.

---

# Recommended Technical Stack

## Backend
- PostgreSQL

## Realtime
- Supabase Realtime or WebSockets for live scoring.

## Notifications
- Push notifications scoped only to active participants.

## Permissions
- Row-level permissions recommended for:
  - Event access
  - Spectator mode
  - Score editing
  - Organizer controls

---

# Out of Scope (MVP)

- Automatic closest-to-pin detection.
- Automatic poker hand evaluation.
- Advanced anti-cheat systems.
- AI scoring validation.
- GPS shot tracking.

---

# Architecture Notes

- Side games should be fully modular.
- Strong distinction required between:
  - Organizer
  - Active Player
  - Spectator

- Notification system must only target active participants.
- Realtime updates strongly recommended.
- Event scoring must remain isolated from main app scoring when excluded.