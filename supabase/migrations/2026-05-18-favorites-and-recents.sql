BEGIN;

-- Per-user course favorites.
CREATE TABLE IF NOT EXISTS favorite_courses (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_courses_user
  ON favorite_courses(user_id, created_at DESC);

-- Per-user recent course search terms. Capped per-user in app layer to ~20.
CREATE TABLE IF NOT EXISTS recent_course_searches (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query       TEXT NOT NULL,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recent_course_searches_user
  ON recent_course_searches(user_id, searched_at DESC);

COMMIT;
