# The Match — TODO

Status as of 2026-05-10. See `AGENTS.md` for working agreements with Claude.

## Shipped

### Phase 1 — Auth foundation
- Replaced original Supabase scaffold with **local SQLite** (`./data/golf.db`, gitignored) + custom session-cookie auth.
- Username + password only. No email anywhere.
- Admin account `admin` / `admin` seeded automatically on first DB init.
- Next 16 `proxy.ts` does a cheap cookie-presence gate; authoritative auth lives in route handlers / server components via `getCurrentUser()`.

### Phase 2A — Core gameplay
- ~40 Oakland County public courses pre-seeded.
- Log a round: course (searchable) → date → up to 8 players (registered users **or** typed guest names) → gross scores → notes.
- Season leaderboard ranked by avg, showing rounds played + wins + best score. Win = strict-lowest in a field of ≥ 2 players.

### Phase 2B — Detail, history, stats
- Round detail page with view + edit + delete (creator or admin only).
- Recent rounds feed on home, linked to round detail.
- Stats page with two tabs:
  - **Head-to-Head:** pick two players, see W-L-T and a clickable round history.
  - **Player:** stats overview, recent rounds with placement, by-course breakdown.
- Season filter (All / 2026 / 2025 / 2024) on both tabs.
- Courses list + search + course detail page with top-10 scores recorded there.
- Profile page with your own record + best courses.

### Phase 2C — Admin & account hygiene
- Add a course (any logged-in user) with duplicate name+city detection.
- Change password on Profile.
- **Promote a guest → real account** (admin only) at `/admin`. All existing guest scores get re-linked to the new user — leaderboard merges automatically.

---

## Pending

### Priority 1 — Handicap support (the one feature in the original vision still missing)
Schema already has `handicap_index` and `net_score` columns on `scores` — currently unused.
- [ ] Decide handicap calc: USGA-style (best 8 of last 20 differentials) or simple rolling average?
- [ ] Compute & store `handicap_index` per user. Auto-update after each round? Or manual?
- [ ] Compute `net_score` per score using slope/rating of the course.
- [ ] Toggle on leaderboard: gross vs net. Same for H2H.
- [ ] UI input on round form (optional handicap override).
- [ ] Profile shows current handicap index.

### Priority 2 — Convenience polish
- [ ] **Change admin password.** Still seeded as `admin/admin` — anyone on the LAN can log in as admin until you change it. (Use the Change Password section on `/profile`.)
- [ ] Delete-a-course (admin only). Currently no UI; only blocked if rounds reference it.
- [ ] Edit-a-course (fix typos, update slope/rating).
- [ ] Filter Stats by course (in addition to season).
- [ ] Filter the leaderboard by course or by date range.
- [ ] Fun "stats" beyond H2H: longest win streak, most-played course, biggest blowout, lowest round at every course.

### Priority 3 — Sharing & onboarding
- [ ] PWA install prompt / iOS home-screen polish (manifest already present in `app/layout.tsx`).
- [ ] Invite link for new players (generates a one-shot registration token).
- [ ] Admin can reset another user's password.
- [ ] Self-serve account deletion.

### Priority 4 — Nice-to-haves
- [ ] Round notes per player (schema already supports `scores.notes`, UI doesn't surface it yet).
- [ ] Photos per round (would need image storage — biggest scope creep, defer).
- [ ] Course-specific scorecards (hole-by-hole). Currently scores are gross totals only.
- [ ] Export / backup the SQLite DB to a JSON dump.

---

## Known issues / sharp edges
- Admin password is still `admin/admin` until changed.
- Supabase deps (`@supabase/ssr`, `@supabase/supabase-js`) are still in `package.json` from the original scaffold — nothing imports them. Safe to `npm uninstall` when cleaning up.
- Deleting a course is not blocked at the schema level if rounds reference it (`FOREIGN KEY` without `ON DELETE` clause). Add `RESTRICT` or handle on delete when adding course-delete UI.
- No CSRF protection on state-changing routes. Acceptable for a friend-group app on a private network; revisit if we ever expose this publicly.

## How the code is laid out
- `src/lib/db.ts` — SQLite + schema + course seed + admin seed.
- `src/lib/auth.ts` — server-only session helpers (`getCurrentUser`, etc.).
- `src/lib/players.ts` — `PlayerKey` system (`u:uuid` vs `g:lowercase`) used everywhere there's a mix of registered users and guests.
- `src/proxy.ts` — Next 16 proxy (replaces deprecated `middleware.ts`).
- `src/app/api/**` — route handlers (REST-ish).
- `src/app/**/page.tsx` — App Router pages.
- `src/components/round-form.tsx` — shared between `/rounds/new` and `/rounds/[id]/edit`.
