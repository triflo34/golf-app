# Golf App - Course API Integration (Yardage + Pre-fill)

## Overview

Integrate searchable golf course data into the app using GolfCourseAPI.com.

The system should allow users to:
- Search for golf courses quickly.
- Select tee sets.
- Auto-populate scorecards with:
  - Yardages
  - Pars
  - Handicaps

The integration must aggressively cache data locally in Postgres to minimize API usage and ensure fast performance.

This system should serve as foundational infrastructure for:
- Casual rounds
- Competitive rounds
- Golfapalooza events
- Historical round tracking

---

# Core Goals

- Fast course search and selection.
- Minimal external API usage.
- Reliable cached course data.
- Support both 9-hole and 18-hole play.
- Pre-filled scorecards for faster round setup.
- Historical round integrity.
- Offline support for previously cached courses.

---

# External API

Use:
- GolfCourseAPI.com

## Free Tier Constraints
- 300 requests/day maximum.

Because of this:
- Aggressive caching is REQUIRED.
- Avoid unnecessary requests at all costs.

---

# API Usage Rules (Critical)

Only call the external API for:

1. Course search
   - `/search`

2. Fetching full course details
   - `/courses/{id}`

---

## NEVER Call API For

- Loading historical rounds.
- Loading scorecards after round creation.
- Leaderboards.
- Live scoring.
- Previously cached courses.
- Tee selection after initial fetch.

All post-selection data should come from the local database only.

---

# API Protection Rules

To avoid exceeding rate limits:

- Debounce frontend search requests.
- Require minimum 2 character search term.
- Cache search responses temporarily when possible.
- Prevent duplicate simultaneous requests for the same course.
- Always check database cache before external API.
- Prefer stale cache over unnecessary API request failures.

---

# Suggested Core Tables

Create these tables:

- `courses`
- `course_tees`
- `course_holes`

Additional optional/supporting tables:

- `favorite_courses`
- `recent_course_searches`

---

# Recommended Relationships

## courses
- Has many `course_tees`

## course_tees
- Belongs to `courses`
- Has many `course_holes`

## course_holes
- Belongs to `course_tees`

---

# Database Requirements

Use PostgreSQL.

Include:
- Proper indexes
- Foreign keys
- Unique constraints
- External API identifiers

---

# Suggested Schema Fields

## courses

Store:
- Internal ID
- External API ID
- Course name
- City
- State
- Country
- Latitude
- Longitude
- Hole count
- Last fetched timestamp
- Created at
- Updated at

---

## course_tees

Store:
- Internal ID
- Course ID
- Tee name
- Gender
- Total yardage
- Course rating
- Slope rating
- Front 9 yardage
- Back 9 yardage

---

## course_holes

Store:
- Internal ID
- Course tee ID
- Hole number
- Par
- Handicap
- Yardage

---

# Backend Requirements

## Environment Variables

Add:
- `GOLFCOURSE_API_KEY`

---

## Services

Create:
- `golfCourseApiService.ts`

Responsibilities:
- External API communication
- Cache validation
- Data normalization
- Error handling
- Rate-limit protection

---

# Caching Strategy

## Cache Rules

Before calling API:
1. Check local database first.
2. If course exists and is fresh:
   - Use cached data.
3. If missing or stale:
   - Fetch from API.
   - Save/update local cache.

---

## Cache Freshness Rules

- Course data valid for 30 days.
- Do NOT auto-refresh during normal round creation.

Refresh only when:
- Course missing locally.
- Admin manually refreshes.
- Cache expired AND user explicitly opens course details.

---

## Cache Storage

Store:
- Full course metadata
- Tee data
- Hole-by-hole details

Use:
- `last_fetched` timestamp.

---

# API Endpoints

## Course Search
`POST /api/courses/search`

Input:
- Search term

Returns:
- Matching courses

---

## Course Details
`GET /api/courses/:externalId`

Behavior:
- Return cached course if valid.
- Otherwise fetch + cache + return.

---

## Tee Sets
`GET /api/courses/:id/tees`

Returns:
- Available tee sets for selected course.

---

# Frontend Flow

## Round Creation Flow

1. User clicks:
   - "Create Round"

2. Optional course search appears.

3. User searches course.

4. Display matching results.

5. User selects course.

6. Display available tee sets.

7. User selects:
   - Tee set
   - 9 or 18 holes

8. Scorecard auto-populates:
   - Yardage
   - Par
   - Handicap

9. User may manually override values if needed.

---

# Search UX Requirements

Search results should display:
- Course name
- City/state
- Hole count

Support:
- Partial name matching
- Recently searched courses
- Favorite courses

---

## Empty States

Handle:
- No results found
- API unavailable
- Offline mode
- Rate limit exceeded

---

# Manual Course Entry

Users should still be able to:
- Create custom/manual courses.
- Override API values.
- Create temporary one-time rounds.
- Use scorecards without API dependency.

Manual courses should support:
- Custom tees
- Custom pars
- Custom yardages

---

# Historical Round Integrity

This is critical.

When a round is created:
- Store snapshot values for:
  - Tee name
  - Hole pars
  - Hole handicaps
  - Hole yardages

Historical rounds should remain accurate even if:
- Course data changes later
- Tee sets are updated
- API data changes

Rounds must NOT dynamically reference live course data after creation.

---

# Additional Features

## Favorites
Allow users to:
- Favorite courses
- Quickly access local/frequent courses

---

## Recently Used Courses
Track:
- Recently played
- Recently searched

---

## Manual Refresh
Allow:
- Admin-only or organizer refresh button

Purpose:
- Refresh stale course data manually.

---

## Round Associations
Store:
- Course reference
- Tee reference
- Snapshot scorecard data

with each round.

---

# Offline Support

Previously cached courses should:
- Load without internet.
- Support offline round creation.
- Support offline score entry.

---

# Nice-to-Haves (Phase 2)

- Mini map display
- GPS distance to green
- User-submitted course corrections
- Community course verification
- Tee recommendation system
- Smart local course suggestions

---

# Acceptance Criteria

- User can search/select course in under 10 seconds.
- Scorecards pre-fill correctly.
- 9-hole and 18-hole supported.
- Minimal unnecessary API calls.
- Cached courses load instantly.
- Offline support works for cached courses.
- UI feels polished and golf-focused.

---

# Recommended Architecture Notes

- Keep external API logic isolated in service layer.
- Never directly call external API from frontend.
- Prefer cached data over live fetches whenever possible.
- Use normalized course structures internally.
- Design schema to support future:
  - GPS
  - Advanced analytics
  - Handicap calculations
  - Multi-round tournaments

---

# Implementation Order

## Phase 1
- Database schema
- API service layer
- Cache logic
- Search endpoints

## Phase 2
- Round creation UI
- Tee selection
- Scorecard auto-fill

## Phase 3
- Favorites
- Offline support
- Manual refresh tools

## Phase 4
- GPS features
- Maps
- Community edits

---

# Initial Development Instruction

Start with:
1. Backend services
2. Database schema
3. Cache logic
4. API endpoints

Do NOT build frontend yet.
Frontend implementation will happen after backend completion and review.