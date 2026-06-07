import postgres from "postgres";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

type GlobalCache = {
  __sql?: postgres.Sql;
  __initPromise?: Promise<void>;
};
const globalForDb = globalThis as unknown as GlobalCache;

function getSql(): postgres.Sql {
  if (globalForDb.__sql) return globalForDb.__sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local locally and to Project Settings → Environment Variables in Vercel (use the Supabase Transaction pooler URL on port 6543).",
    );
  }
  globalForDb.__sql = postgres(url, {
    // pgbouncer transaction mode doesn't support session-level prepared statements
    prepare: false,
    ssl: "require",
    max: 10,
    connect_timeout: 10,
  });
  return globalForDb.__sql;
}

type Param = string | number | boolean | bigint | null | Date;

function toPg(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

const QUERY_TIMEOUT_MS = 8000;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class PreparedQuery {
  constructor(
    private readonly query: string,
    private readonly client?: postgres.Sql | postgres.TransactionSql,
  ) {}

  private resolveClient(): postgres.Sql | postgres.TransactionSql {
    return this.client ?? getSql();
  }

  async get<T = unknown>(...params: Param[]): Promise<T | undefined> {
    await ensureInit();
    const rows = await withTimeout(
      this.resolveClient().unsafe<T[]>(toPg(this.query), params as never[]),
      QUERY_TIMEOUT_MS,
      "db query",
    );
    return (rows[0] ?? undefined) as T | undefined;
  }

  async all<T = unknown>(...params: Param[]): Promise<T[]> {
    await ensureInit();
    const rows = await withTimeout(
      this.resolveClient().unsafe<T[]>(toPg(this.query), params as never[]),
      QUERY_TIMEOUT_MS,
      "db query",
    );
    return rows as unknown as T[];
  }

  async run(...params: Param[]): Promise<{ rowCount: number }> {
    await ensureInit();
    const result = await withTimeout(
      this.resolveClient().unsafe(toPg(this.query), params as never[]),
      QUERY_TIMEOUT_MS,
      "db query",
    );
    return { rowCount: result.count ?? 0 };
  }
}

export type DbApi = {
  prepare: (query: string) => PreparedQuery;
  exec: (query: string) => Promise<void>;
};

function makeDb(client?: postgres.Sql | postgres.TransactionSql): DbApi {
  return {
    prepare: (query: string) => new PreparedQuery(query, client),
    exec: async (query: string) => {
      await (client ?? getSql()).unsafe(query);
    },
  };
}

export const db: DbApi = makeDb();

export async function withTransaction<T>(
  fn: (tx: DbApi) => Promise<T>,
): Promise<T> {
  return (await getSql().begin((txSql) => fn(makeDb(txSql)))) as T;
}

// ---- Schema + seed bootstrap (lazy, runs once per process) ----

async function bootstrap(): Promise<void> {
  console.log("[db] bootstrap: getSql");
  const sql = getSql();
  console.log("[db] bootstrap: schema");
  await sql.unsafe(SCHEMA_SQL);
  console.log("[db] bootstrap: ensureHiddenColumn");
  await ensureHiddenColumn(sql);
  console.log("[db] bootstrap: ensureHoleCountColumn");
  await ensureHoleCountColumn(sql);
  console.log("[db] bootstrap: ensureCourseGeoColumns");
  await ensureCourseGeoColumns(sql);
  console.log("[db] bootstrap: ensureRoundWeatherColumns");
  await ensureRoundWeatherColumns(sql);
  console.log("[db] bootstrap: ensureRoundEventColumns");
  await ensureRoundEventColumns(sql);
  console.log("[db] bootstrap: ensureCourseApiColumns");
  await ensureCourseApiColumns(sql);
  console.log("[db] bootstrap: ensureEventParticipantOrganizerFlag");
  await ensureEventParticipantOrganizerFlag(sql);
  console.log("[db] bootstrap: ensurePokerWildCardColumn");
  await ensurePokerWildCardColumn(sql);
  console.log("[db] bootstrap: ensureHoleScoreSnapshotColumns");
  await ensureHoleScoreSnapshotColumns(sql);
  console.log("[db] bootstrap: ensureCourseNineHoleRatingColumns");
  await ensureCourseNineHoleRatingColumns(sql);
  console.log("[db] bootstrap: ensureRoundsNinePlayedColumn");
  await ensureRoundsNinePlayedColumn(sql);
  console.log("[db] bootstrap: ensureRoundsStatusColumn");
  await ensureRoundsStatusColumn(sql);
  console.log("[db] bootstrap: ensureHoleScoresGuestColumns");
  await ensureHoleScoresGuestColumns(sql);
  console.log("[db] bootstrap: ensureRoundPlayersTable");
  await ensureRoundPlayersTable(sql);
  console.log("[db] bootstrap: ensureFeedEventsTable");
  await ensureFeedEventsTable(sql);
  console.log("[db] bootstrap: ensureEventHoleConfigColumns");
  await ensureEventHoleConfigColumns(sql);
  console.log("[db] bootstrap: ensureEventParticipantSeqColumn");
  await ensureEventParticipantSeqColumn(sql);
  console.log("[db] bootstrap: ensureRoundsExcludedColumn");
  await ensureRoundsExcludedColumn(sql);
  console.log("[db] bootstrap: ensureSideGameKinds");
  await ensureSideGameKinds(sql);
  console.log("[db] bootstrap: seedAdmin");
  await seedAdmin(sql);
  console.log("[db] bootstrap: seedCourses");
  await seedCourses(sql);
  console.log("[db] bootstrap: done");
}

const BOOTSTRAP_TIMEOUT_MS = 8000;

async function ensureCriticalColumns(): Promise<void> {
  const sql = getSql();
  // These migrations must run even with SKIP_DB_BOOTSTRAP=1, as queries depend on them
  console.log("[db] ensureCriticalColumns: nine_played");
  await ensureRoundsNinePlayedColumn(sql);
  console.log("[db] ensureCriticalColumns: nine_hole_ratings");
  await ensureCourseNineHoleRatingColumns(sql);
  console.log("[db] ensureCriticalColumns: rounds_status");
  await ensureRoundsStatusColumn(sql);
  console.log("[db] ensureCriticalColumns: hole_scores_guest");
  await ensureHoleScoresGuestColumns(sql);
  console.log("[db] ensureCriticalColumns: round_players");
  await ensureRoundPlayersTable(sql);
  console.log("[db] ensureCriticalColumns: feed_events");
  await ensureFeedEventsTable(sql);
  console.log("[db] ensureCriticalColumns: event_hole_config");
  await ensureEventHoleConfigColumns(sql);
  console.log("[db] ensureCriticalColumns: event_participant_seq");
  await ensureEventParticipantSeqColumn(sql);
  console.log("[db] ensureCriticalColumns: rounds_excluded");
  await ensureRoundsExcludedColumn(sql);
  console.log("[db] ensureCriticalColumns: event_invite");
  await ensureEventInviteColumns(sql);
  // Standings selects hole_scores.par / team_hole_scores.par (snapshotted at
  // write time). Without these columns that endpoint 500s — the event Board,
  // Games and Payouts tabs then hang on "Loading…" — even though scoring and
  // the event page work. Guarantee them here so SKIP_DB_BOOTSTRAP prod is safe.
  console.log("[db] ensureCriticalColumns: hole_score_snapshots");
  await ensureHoleScoreSnapshotColumns(sql);
  console.log("[db] ensureCriticalColumns: side_game_kinds");
  await ensureSideGameKinds(sql);
}

// The side_games.kind CHECK was created inline, so existing databases reject
// any kind added later (e.g. 'stableford'). Widen the constraint in place.
async function ensureSideGameKinds(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'side_games_kind_check'
          AND pg_get_constraintdef(oid) LIKE '%stableford%'
      ) THEN
        ALTER TABLE side_games DROP CONSTRAINT IF EXISTS side_games_kind_check;
        ALTER TABLE side_games ADD CONSTRAINT side_games_kind_check
          CHECK (kind IN ('poker','best18','worst18','most_same','scramble_winners','stableford'));
      END IF;
    END$$;
  `);
}

async function ensureEventInviteColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_token      TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_revoked    BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_events_invite_token
      ON events(invite_token) WHERE invite_token IS NOT NULL;
  `);
}

function ensureInit(): Promise<void> {
  if (process.env.SKIP_DB_BOOTSTRAP === "1") {
    // Even with SKIP_DB_BOOTSTRAP, we must ensure critical columns exist
    if (!globalForDb.__initPromise) {
      globalForDb.__initPromise = ensureCriticalColumns()
        .catch((err) => {
          console.error("[db] ensureCriticalColumns failed:", err);
          delete globalForDb.__initPromise;
          throw err;
        });
    }
    return globalForDb.__initPromise;
  }
  if (!globalForDb.__initPromise) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`db bootstrap timed out after ${BOOTSTRAP_TIMEOUT_MS}ms`)),
        BOOTSTRAP_TIMEOUT_MS,
      );
    });
    globalForDb.__initPromise = Promise.race([bootstrap(), timeoutPromise])
      .finally(() => {
        if (timer) clearTimeout(timer);
      })
      .catch((err) => {
        console.error("[db] bootstrap failed:", err);
        delete globalForDb.__initPromise;
        throw err;
      });
  }
  return globalForDb.__initPromise;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    display_name  TEXT NOT NULL,
    avatar_url    TEXT,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    hidden        INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS courses (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    address         TEXT,
    city            TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'MI',
    holes           INTEGER NOT NULL DEFAULT 18,
    par             INTEGER NOT NULL,
    slope_rating    REAL,
    course_rating   REAL,
    front_9_rating  REAL,
    front_9_slope   REAL,
    back_9_rating   REAL,
    back_9_slope    REAL,
    website         TEXT,
    phone           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id           SERIAL PRIMARY KEY,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    played_at    TEXT NOT NULL,
    created_by   TEXT NOT NULL REFERENCES users(id),
    notes        TEXT,
    hole_count   SMALLINT NOT NULL DEFAULT 18 CHECK (hole_count IN (9, 18)),
    nine_played  TEXT CHECK (nine_played IN ('front','back')),
    status       TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('live','final')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_rounds_played_at ON rounds(played_at);

  CREATE TABLE IF NOT EXISTS scores (
    id              SERIAL PRIMARY KEY,
    round_id        INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id       TEXT REFERENCES users(id),
    guest_name      TEXT,
    gross_score     INTEGER NOT NULL,
    handicap_index  REAL,
    net_score       REAL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_scores_round_player
    ON scores(round_id, player_id) WHERE player_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_scores_round_guest
    ON scores(round_id, guest_name) WHERE guest_name IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);

  -- Roster for a round before final scores exist (live mode). When the round
  -- finishes, scores rows are written and round_players keeps the original
  -- seq so the live page stays stable. For non-live rounds this table is unused.
  CREATE TABLE IF NOT EXISTS round_players (
    round_id   INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id  TEXT REFERENCES users(id),
    guest_name TEXT,
    seq        SMALLINT NOT NULL DEFAULT 0,
    CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_round_players_player
    ON round_players(round_id, player_id) WHERE player_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_round_players_guest
    ON round_players(round_id, guest_name) WHERE guest_name IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_round_players_round ON round_players(round_id);

  -- ===== Golfapalooza event module =====

  CREATE TABLE IF NOT EXISTS events (
    id                       SERIAL PRIMARY KEY,
    name                     TEXT NOT NULL,
    course_id                INTEGER NOT NULL REFERENCES courses(id),
    start_date               DATE NOT NULL,
    end_date                 DATE NOT NULL,
    entry_fee_cents          INTEGER NOT NULL DEFAULT 0,
    description              TEXT,
    status                   TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','open','in_progress','completed','archived')),
    exclude_from_leaderboard BOOLEAN NOT NULL DEFAULT FALSE,
    created_by               TEXT NOT NULL REFERENCES users(id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    invite_token             TEXT,
    invite_expires_at        TIMESTAMPTZ,
    invite_revoked           BOOLEAN NOT NULL DEFAULT FALSE
  );
  CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_events_invite_token
    ON events(invite_token) WHERE invite_token IS NOT NULL;

  CREATE TABLE IF NOT EXISTS event_participants (
    event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id),
    role         TEXT NOT NULL DEFAULT 'player'
                  CHECK (role IN ('organizer','player')),
    is_organizer BOOLEAN NOT NULL DEFAULT FALSE,
    group_num    SMALLINT,
    PRIMARY KEY (event_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_event_participants_user ON event_participants(user_id);

  CREATE TABLE IF NOT EXISTS course_holes (
    course_id      INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    hole_number    SMALLINT NOT NULL,
    par            SMALLINT NOT NULL,
    handicap_index SMALLINT,
    PRIMARY KEY (course_id, hole_number)
  );

  CREATE TABLE IF NOT EXISTS hole_scores (
    id             SERIAL PRIMARY KEY,
    round_id       INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id      TEXT REFERENCES users(id),
    guest_name     TEXT,
    hole_number    SMALLINT NOT NULL,
    strokes        SMALLINT NOT NULL,
    par            SMALLINT,
    handicap_index SMALLINT,
    yardage        INTEGER,
    updated_by     TEXT REFERENCES users(id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_hole_scores_player
    ON hole_scores(round_id, player_id, hole_number) WHERE player_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_hole_scores_guest
    ON hole_scores(round_id, guest_name, hole_number) WHERE guest_name IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_hole_scores_round ON hole_scores(round_id);

  CREATE TABLE IF NOT EXISTS score_edits (
    id            SERIAL PRIMARY KEY,
    hole_score_id INTEGER REFERENCES hole_scores(id) ON DELETE SET NULL,
    round_id      INTEGER NOT NULL,
    player_id     TEXT,
    guest_name    TEXT,
    hole_number   SMALLINT NOT NULL,
    old_strokes   SMALLINT,
    new_strokes   SMALLINT,
    edited_by     TEXT NOT NULL REFERENCES users(id),
    edited_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_score_edits_round ON score_edits(round_id);

  CREATE TABLE IF NOT EXISTS scramble_teams (
    id        SERIAL PRIMARY KEY,
    round_id  INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    name      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scramble_teams_round ON scramble_teams(round_id);

  CREATE TABLE IF NOT EXISTS scramble_team_members (
    team_id  INTEGER NOT NULL REFERENCES scramble_teams(id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (team_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS team_hole_scores (
    id             SERIAL PRIMARY KEY,
    team_id        INTEGER NOT NULL REFERENCES scramble_teams(id) ON DELETE CASCADE,
    hole_number    SMALLINT NOT NULL,
    strokes        SMALLINT NOT NULL,
    par            SMALLINT,
    handicap_index SMALLINT,
    yardage        INTEGER,
    updated_by     TEXT REFERENCES users(id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_id, hole_number)
  );
  CREATE INDEX IF NOT EXISTS idx_team_hole_scores_team ON team_hole_scores(team_id);

  CREATE TABLE IF NOT EXISTS side_games (
    id         SERIAL PRIMARY KEY,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL
                CHECK (kind IN ('poker','best18','worst18','most_same','scramble_winners','stableford')),
    pot_cents  INTEGER NOT NULL DEFAULT 0,
    config     JSONB,
    UNIQUE (event_id, kind)
  );

  CREATE TABLE IF NOT EXISTS side_game_results (
    id            SERIAL PRIMARY KEY,
    side_game_id  INTEGER NOT NULL REFERENCES side_games(id) ON DELETE CASCADE,
    player_id     TEXT REFERENCES users(id),
    team_id       INTEGER REFERENCES scramble_teams(id),
    rank          SMALLINT,
    payout_cents  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS poker_hands (
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    player_id   TEXT NOT NULL REFERENCES users(id),
    cards       JSONB NOT NULL DEFAULT '[]'::jsonb,
    wild_count  SMALLINT NOT NULL DEFAULT 0,
    bogey_count SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS poker_deck_state (
    event_id   INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    num_decks  SMALLINT NOT NULL DEFAULT 1,
    drawn      JSONB NOT NULL DEFAULT '[]'::jsonb,
    wild_card  JSONB
  );

  CREATE TABLE IF NOT EXISTS poker_swap_queue (
    id            SERIAL PRIMARY KEY,
    event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    player_id     TEXT NOT NULL REFERENCES users(id),
    incoming_card JSONB,
    delta         SMALLINT NOT NULL DEFAULT 1,
    resolved_at   TIMESTAMPTZ,
    swapped_card  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_poker_swap_pending
    ON poker_swap_queue(event_id, player_id) WHERE resolved_at IS NULL;

  CREATE TABLE IF NOT EXISTS favorite_courses (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
  );
  CREATE INDEX IF NOT EXISTS idx_favorite_courses_user
    ON favorite_courses(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS recent_course_searches (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query       TEXT NOT NULL,
    searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_recent_course_searches_user
    ON recent_course_searches(user_id, searched_at DESC);

  -- Social activity feed. One row per generated event (round_completed,
  -- round_win, birdie, eagle, bogey_free_nine, career_best, first_sub_threshold).
  -- dedup_key makes regeneration on edits idempotent.
  CREATE TABLE IF NOT EXISTS feed_events (
    id          SERIAL PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN (
                  'round_completed','round_win','birdie','eagle',
                  'bogey_free_nine','career_best','first_sub_threshold'
                )),
    round_id    INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
    player_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
    guest_name  TEXT,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    dedup_key   TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_feed_events_occurred_at
    ON feed_events(occurred_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_feed_events_round
    ON feed_events(round_id);
  CREATE INDEX IF NOT EXISTS idx_feed_events_player
    ON feed_events(player_id);
`;

async function ensureHiddenColumn(sql: postgres.Sql): Promise<void> {
  // Postgres ≥ 9.6 supports IF NOT EXISTS on ADD COLUMN.
  await sql.unsafe(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden INTEGER NOT NULL DEFAULT 0`,
  );
}

async function ensureHoleCountColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    `ALTER TABLE rounds ADD COLUMN IF NOT EXISTS hole_count SMALLINT NOT NULL DEFAULT 18`,
  );
  // CHECK constraints don't have IF NOT EXISTS in older PG; guard by name.
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rounds_hole_count_check'
      ) THEN
        ALTER TABLE rounds
          ADD CONSTRAINT rounds_hole_count_check CHECK (hole_count IN (9, 18));
      END IF;
    END$$;
  `);
}

async function ensureCourseGeoColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
  `);
}

async function ensureRoundWeatherColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS temp_high_f       REAL;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS temp_low_f        REAL;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS wind_max_mph      REAL;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS precip_in         REAL;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS weather_code      SMALLINT;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS weather_fetched_at TIMESTAMPTZ;
  `);
}

async function ensureEventParticipantOrganizerFlag(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE event_participants
      ADD COLUMN IF NOT EXISTS is_organizer BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  // Backfill: any existing 'organizer' role rows become role='player' + is_organizer=true.
  await sql.unsafe(`
    UPDATE event_participants
      SET is_organizer = TRUE
      WHERE role = 'organizer' AND is_organizer = FALSE;
  `);
  await sql.unsafe(`
    UPDATE event_participants
      SET role = 'player'
      WHERE role = 'organizer';
  `);
}

async function ensurePokerWildCardColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE poker_deck_state ADD COLUMN IF NOT EXISTS wild_card JSONB;
  `);
}

async function ensureHoleScoreSnapshotColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE hole_scores      ADD COLUMN IF NOT EXISTS par            SMALLINT;
    ALTER TABLE hole_scores      ADD COLUMN IF NOT EXISTS handicap_index SMALLINT;
    ALTER TABLE hole_scores      ADD COLUMN IF NOT EXISTS yardage        INTEGER;
    ALTER TABLE team_hole_scores ADD COLUMN IF NOT EXISTS par            SMALLINT;
    ALTER TABLE team_hole_scores ADD COLUMN IF NOT EXISTS handicap_index SMALLINT;
    ALTER TABLE team_hole_scores ADD COLUMN IF NOT EXISTS yardage        INTEGER;
  `);
  // Backfill snapshot values from current course_holes for any rows that
  // were created before snapshotting existed. Idempotent — only touches NULLs.
  // Postgres UPDATE…FROM forbids JOIN ON referencing the UPDATE target, so
  // joins involving hs/ths live in WHERE.
  await sql.unsafe(`
    UPDATE hole_scores hs
      SET par            = ch.par,
          handicap_index = ch.handicap_index,
          yardage        = ch.yardage
      FROM rounds r, course_holes ch
      WHERE hs.round_id = r.id
        AND ch.course_id = r.course_id
        AND ch.hole_number = hs.hole_number
        AND (hs.par IS NULL OR hs.handicap_index IS NULL OR hs.yardage IS NULL);
  `);
  await sql.unsafe(`
    UPDATE team_hole_scores ths
      SET par            = ch.par,
          handicap_index = ch.handicap_index,
          yardage        = ch.yardage
      FROM scramble_teams st, rounds r, course_holes ch
      WHERE ths.team_id = st.id
        AND r.id = st.round_id
        AND ch.course_id = r.course_id
        AND ch.hole_number = ths.hole_number
        AND (ths.par IS NULL OR ths.handicap_index IS NULL OR ths.yardage IS NULL);
  `);
}

async function ensureCourseNineHoleRatingColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS front_9_rating REAL;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS front_9_slope  REAL;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS back_9_rating  REAL;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS back_9_slope   REAL;
  `);
}

async function ensureRoundsNinePlayedColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    `ALTER TABLE rounds ADD COLUMN IF NOT EXISTS nine_played TEXT`,
  );
  await sql.unsafe(`
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
  `);
  await sql.unsafe(
    `UPDATE rounds SET nine_played = 'front'
     WHERE hole_count = 9 AND nine_played IS NULL`,
  );
}

async function ensureRoundsStatusColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    `ALTER TABLE rounds ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final'`,
  );
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rounds_status_check'
      ) THEN
        ALTER TABLE rounds
          ADD CONSTRAINT rounds_status_check
          CHECK (status IN ('live','final'));
      END IF;
    END$$;
  `);
}

async function ensureHoleScoresGuestColumns(sql: postgres.Sql): Promise<void> {
  // Add the guest_name column and let player_id be nullable so guests can
  // appear on the live scorer alongside registered users. Existing rows
  // (all registered-player edits) are unaffected.
  await sql.unsafe(`
    ALTER TABLE hole_scores  ADD COLUMN IF NOT EXISTS guest_name TEXT;
    ALTER TABLE hole_scores  ALTER COLUMN player_id DROP NOT NULL;
    ALTER TABLE score_edits  ADD COLUMN IF NOT EXISTS guest_name TEXT;
    ALTER TABLE score_edits  ALTER COLUMN player_id DROP NOT NULL;
  `);
  // Exactly-one-of constraint (named, idempotent via guard).
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'hole_scores_player_or_guest_check'
      ) THEN
        ALTER TABLE hole_scores
          ADD CONSTRAINT hole_scores_player_or_guest_check
          CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL));
      END IF;
    END$$;
  `);
  // Replace the old strict UNIQUE with two partial unique indexes — one per
  // identity kind. Drop the legacy constraint if it exists. UNIQUE creates an
  // implicit index named `hole_scores_round_id_player_id_hole_number_key`
  // (Postgres default), so we drop it by constraint name.
  await sql.unsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'hole_scores_round_id_player_id_hole_number_key'
      ) THEN
        ALTER TABLE hole_scores
          DROP CONSTRAINT hole_scores_round_id_player_id_hole_number_key;
      END IF;
    END$$;
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_hole_scores_player
      ON hole_scores(round_id, player_id, hole_number) WHERE player_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_hole_scores_guest
      ON hole_scores(round_id, guest_name, hole_number) WHERE guest_name IS NOT NULL;
  `);
}

async function ensureRoundPlayersTable(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS round_players (
      round_id   INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      player_id  TEXT REFERENCES users(id),
      guest_name TEXT,
      seq        SMALLINT NOT NULL DEFAULT 0,
      CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_round_players_player
      ON round_players(round_id, player_id) WHERE player_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_round_players_guest
      ON round_players(round_id, guest_name) WHERE guest_name IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_round_players_round ON round_players(round_id);
  `);
}

async function ensureRoundsExcludedColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}

async function ensureEventParticipantSeqColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE event_participants
      ADD COLUMN IF NOT EXISTS seq SMALLINT NOT NULL DEFAULT 0;
  `);
  // Backfill: for any event whose participants are all seq=0, assign sequential
  // order by display_name so existing events have a stable order rather than
  // an arbitrary one.
  await sql.unsafe(`
    WITH ranked AS (
      SELECT ep.event_id, ep.user_id,
             ROW_NUMBER() OVER (
               PARTITION BY ep.event_id
               ORDER BY ep.is_organizer DESC, u.display_name ASC
             ) AS rn
      FROM event_participants ep
      JOIN users u ON u.id = ep.user_id
      WHERE ep.event_id IN (
        SELECT event_id FROM event_participants
        GROUP BY event_id
        HAVING COUNT(*) FILTER (WHERE seq <> 0) = 0
      )
    )
    UPDATE event_participants ep
    SET seq = ranked.rn
    FROM ranked
    WHERE ep.event_id = ranked.event_id AND ep.user_id = ranked.user_id;
  `);
}

async function ensureEventHoleConfigColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS total_holes      SMALLINT NOT NULL DEFAULT 18;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS second_course_id INTEGER REFERENCES courses(id);
  `);
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_total_holes_check'
      ) THEN
        ALTER TABLE events
          ADD CONSTRAINT events_total_holes_check
          CHECK (total_holes IN (9, 18, 36));
      END IF;
    END$$;
  `);
}

async function ensureFeedEventsTable(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS feed_events (
      id          SERIAL PRIMARY KEY,
      kind        TEXT NOT NULL,
      round_id    INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
      player_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
      guest_name  TEXT,
      data        JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL,
      dedup_key   TEXT NOT NULL UNIQUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'feed_events_kind_check'
      ) THEN
        ALTER TABLE feed_events
          ADD CONSTRAINT feed_events_kind_check
          CHECK (kind IN (
            'round_completed','round_win','birdie','eagle',
            'bogey_free_nine','career_best','first_sub_threshold'
          ));
      END IF;
    END$$;
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_feed_events_occurred_at
      ON feed_events(occurred_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_feed_events_round
      ON feed_events(round_id);
    CREATE INDEX IF NOT EXISTS idx_feed_events_player
      ON feed_events(player_id);
  `);
}

async function ensureCourseApiColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS external_id     TEXT;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ;
    ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS yardage INTEGER;
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_external_id
      ON courses(external_id) WHERE external_id IS NOT NULL;
  `);
}

async function ensureRoundEventColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS event_id     INTEGER REFERENCES events(id) ON DELETE SET NULL;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'total';
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS round_number SMALLINT;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS round_format TEXT NOT NULL DEFAULT 'individual';
  `);
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rounds_scoring_mode_check'
      ) THEN
        ALTER TABLE rounds
          ADD CONSTRAINT rounds_scoring_mode_check
          CHECK (scoring_mode IN ('total','hole_by_hole'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rounds_round_format_check'
      ) THEN
        ALTER TABLE rounds
          ADD CONSTRAINT rounds_round_format_check
          CHECK (round_format IN ('individual','scramble'));
      END IF;
    END$$;
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rounds_event ON rounds(event_id);`);
}

async function seedAdmin(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM users WHERE is_admin = 1`;
  if ((rows[0]?.n ?? 0) > 0) return;
  const id = randomUUID();
  const hash = bcrypt.hashSync("admin", 10);
  await sql`
    INSERT INTO users (id, username, display_name, password_hash, is_admin)
    VALUES (${id}, 'admin', 'Admin', ${hash}, 1)
  `;
}

type CourseSeed = {
  name: string;
  address: string | null;
  city: string;
  par: number;
  holes: number;
  slope: number | null;
  rating: number | null;
  phone: string | null;
};

async function seedCourses(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM courses`;
  if ((rows[0]?.n ?? 0) > 0) return;
  const records = OAKLAND_COURSES.map((c) => ({
    name: c.name,
    address: c.address,
    city: c.city,
    par: c.par,
    holes: c.holes,
    slope_rating: c.slope,
    course_rating: c.rating,
    phone: c.phone,
  }));
  await sql`INSERT INTO courses ${sql(records, "name", "address", "city", "par", "holes", "slope_rating", "course_rating", "phone")}`;
}

// Oakland County, MI public golf courses — ~40 entries.
const OAKLAND_COURSES: CourseSeed[] = [
  { name: "Pontiac Country Club", address: "4335 Elizabeth Lake Rd", city: "Waterford", par: 71, holes: 18, slope: 126, rating: 70.1, phone: "248-682-6333" },
  { name: "Twin Lakes Golf Club", address: "689 N Oakland Blvd", city: "Waterford", par: 60, holes: 18, slope: 96, rating: 58.2, phone: "248-332-9141" },
  { name: "White Lake Oaks Golf Course", address: "991 Williams Lake Rd", city: "White Lake", par: 70, holes: 18, slope: 123, rating: 69.5, phone: "248-698-2700" },
  { name: "Heather Highlands Golf Club", address: "11450 E Holly Rd", city: "Holly", par: 72, holes: 18, slope: 131, rating: 71.8, phone: "248-634-6800" },
  { name: "Springfield Oaks Golf Course", address: "12450 Andersonville Rd", city: "Davisburg", par: 71, holes: 18, slope: 121, rating: 69.4, phone: "248-625-2540" },
  { name: "Highland Hills Golf Course", address: "2075 Oakland Dr", city: "Highland", par: 36, holes: 9, slope: 113, rating: 34.5, phone: null },
  { name: "Pine Knob Golf Club", address: "5580 Waldon Rd", city: "Clarkston", par: 72, holes: 18, slope: 128, rating: 71.2, phone: "248-625-4430" },
  { name: "Indianwood Golf & Country Club", address: "1081 Indianwood Rd", city: "Lake Orion", par: 72, holes: 18, slope: 137, rating: 73.5, phone: "248-693-9812" },
  { name: "Bald Mountain Golf Course", address: "3350 Kern Rd", city: "Lake Orion", par: 71, holes: 18, slope: 118, rating: 68.7, phone: "248-373-1110" },
  { name: "Mulberry Hills Golf Club", address: "13190 Lapeer Rd", city: "Oxford", par: 72, holes: 18, slope: 127, rating: 70.9, phone: "248-628-2808" },
  { name: "Oxford Hills Golf Club", address: "300 E Drahner Rd", city: "Oxford", par: 72, holes: 18, slope: 125, rating: 70.5, phone: "248-628-2518" },
  { name: "Paint Creek Country Club", address: "2375 Stanton Rd", city: "Lake Orion", par: 72, holes: 18, slope: 130, rating: 71.6, phone: "248-693-4695" },
  { name: "Devil's Ridge Golf Club", address: "3700 Metamora Rd", city: "Oxford", par: 72, holes: 18, slope: 140, rating: 73.2, phone: "248-969-0100" },
  { name: "Great Oaks Country Club", address: "777 Great Oaks Blvd", city: "Rochester", par: 72, holes: 18, slope: 133, rating: 72.1, phone: "248-651-5200" },
  { name: "Blackheath Golf Club", address: "1575 Tienken Rd", city: "Rochester Hills", par: 72, holes: 18, slope: 126, rating: 70.3, phone: "248-601-8000" },
  { name: "Sylvan Glen Golf Course", address: "5725 Rochester Rd", city: "Troy", par: 70, holes: 18, slope: 118, rating: 68.5, phone: "248-619-7600" },
  { name: "Sanctuary Lake Golf Course", address: "1450 N Opdyke Rd", city: "Auburn Hills", par: 71, holes: 18, slope: 128, rating: 70.8, phone: "248-332-1400" },
  { name: "Fieldstone Golf Club", address: "1984 Taylor Rd", city: "Auburn Hills", par: 72, holes: 18, slope: 132, rating: 71.5, phone: "248-370-9354" },
  { name: "Glen Oaks Golf Course", address: "30500 W 13 Mile Rd", city: "Farmington Hills", par: 71, holes: 18, slope: 125, rating: 70.2, phone: "248-851-8356" },
  { name: "Farmington Hills Golf Club", address: "29592 Halsted Rd", city: "Farmington Hills", par: 36, holes: 9, slope: 110, rating: 33.8, phone: "248-476-0033" },
  { name: "Edgewood Country Club", address: "8399 Commerce Rd", city: "Commerce Township", par: 72, holes: 18, slope: 124, rating: 70.0, phone: "248-363-9641" },
  { name: "Shenandoah Golf & Country Club", address: "5600 Walnut Lake Rd", city: "West Bloomfield", par: 72, holes: 18, slope: 129, rating: 71.0, phone: "248-682-0040" },
  { name: "The Links of Novi", address: "50395 W 10 Mile Rd", city: "Novi", par: 72, holes: 18, slope: 130, rating: 71.3, phone: "248-380-9595" },
  { name: "Cattails Golf Club", address: "57737 W 9 Mile Rd", city: "South Lyon", par: 72, holes: 18, slope: 133, rating: 72.0, phone: "248-486-8777" },
  { name: "Tanglewood Golf Club", address: "22805 Country Club Dr", city: "South Lyon", par: 72, holes: 18, slope: 127, rating: 70.7, phone: "248-486-3355" },
  { name: "Mystic Creek Golf Club", address: "1 Champions Cir", city: "Milford", par: 72, holes: 18, slope: 135, rating: 72.5, phone: "248-684-3333" },
  { name: "Kensington Metro Park Golf Course", address: "2240 W Buno Rd", city: "Milford", par: 71, holes: 18, slope: 119, rating: 69.0, phone: "248-685-9332" },
  { name: "Coyote Golf Club", address: "28700 Milford Rd", city: "New Hudson", par: 72, holes: 18, slope: 131, rating: 71.4, phone: "248-486-1228" },
  { name: "Dunham Hills Golf Club", address: "13561 Dunham Rd", city: "Milford", par: 72, holes: 18, slope: 127, rating: 70.6, phone: "248-887-9170" },
  { name: "Proud Lake Golf Course", address: "3500 Wixom Rd", city: "Milford", par: 35, holes: 9, slope: 108, rating: 33.2, phone: null },
  { name: "Red Run Golf Club", address: "1370 W 12 Mile Rd", city: "Royal Oak", par: 70, holes: 18, slope: 122, rating: 69.3, phone: "248-544-0240" },
  { name: "Rackham Golf Course", address: "10100 W 10 Mile Rd", city: "Huntington Woods", par: 71, holes: 18, slope: 126, rating: 70.4, phone: "248-543-4040" },
  { name: "Evergreen Hills Golf Course", address: "18751 Evergreen Rd", city: "Southfield", par: 54, holes: 18, slope: 98, rating: 53.5, phone: "248-796-4653" },
  { name: "Beech Woods Golf Course", address: "21800 Inkster Rd", city: "Southfield", par: 69, holes: 18, slope: 114, rating: 67.2, phone: "248-796-4640" },
  { name: "Rogell Golf Course", address: "18601 Berg Rd", city: "Southfield", par: 71, holes: 18, slope: 120, rating: 69.1, phone: "248-796-4644" },
  { name: "Boulder Pointe Golf Club", address: "1 Champions Dr", city: "Oxford", par: 72, holes: 18, slope: 136, rating: 72.8, phone: "248-969-1500" },
  { name: "Metamora Fields Golf Club", address: "1572 Dryden Rd", city: "Metamora", par: 36, holes: 9, slope: 112, rating: 34.2, phone: "810-797-3660" },
  { name: "The Fountains Golf & Banquet", address: "6060 Maybee Rd", city: "Clarkston", par: 72, holes: 18, slope: 124, rating: 69.8, phone: "248-625-3731" },
  { name: "Shepherd's Hollow Golf Club", address: "9085 Big Lake Rd", city: "Clarkston", par: 72, holes: 18, slope: 142, rating: 74.1, phone: "248-922-0300" },
  { name: "Liberty Golf Club", address: "6060 Maybee Rd", city: "Clarkston", par: 72, holes: 18, slope: 126, rating: 70.4, phone: "248-625-3731" },
];
