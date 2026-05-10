import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "golf.db");

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedAdmin(db);
  seedCourses(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      display_name  TEXT NOT NULL,
      avatar_url    TEXT,
      password_hash TEXT NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  INTEGER NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS courses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      address       TEXT,
      city          TEXT NOT NULL,
      state         TEXT NOT NULL DEFAULT 'MI',
      holes         INTEGER NOT NULL DEFAULT 18,
      par           INTEGER NOT NULL,
      slope_rating  REAL,
      course_rating REAL,
      website       TEXT,
      phone         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id   INTEGER NOT NULL REFERENCES courses(id),
      played_at   TEXT NOT NULL,
      created_by  TEXT NOT NULL REFERENCES users(id),
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rounds_played_at ON rounds(played_at);

    CREATE TABLE IF NOT EXISTS scores (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id        INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      player_id       TEXT REFERENCES users(id),
      guest_name      TEXT,
      gross_score     INTEGER NOT NULL,
      handicap_index  REAL,
      net_score       REAL,
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK ((player_id IS NOT NULL) <> (guest_name IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_scores_round_player
      ON scores(round_id, player_id) WHERE player_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_scores_round_guest
      ON scores(round_id, guest_name) WHERE guest_name IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
  `);
}

function seedAdmin(db: Database.Database) {
  const row = db
    .prepare("SELECT COUNT(*) as n FROM users WHERE is_admin = 1")
    .get() as { n: number };
  if (row.n > 0) return;

  const id = randomUUID();
  const hash = bcrypt.hashSync("admin", 10);
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, is_admin)
     VALUES (?, ?, ?, ?, 1)`,
  ).run(id, "admin", "Admin", hash);
}

function seedCourses(db: Database.Database) {
  const row = db.prepare("SELECT COUNT(*) as n FROM courses").get() as {
    n: number;
  };
  if (row.n > 0) return;

  const insert = db.prepare(
    `INSERT INTO courses (name, address, city, par, holes, slope_rating, course_rating, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((rows: CourseSeed[]) => {
    for (const c of rows) {
      insert.run(c.name, c.address, c.city, c.par, c.holes, c.slope, c.rating, c.phone);
    }
  });
  tx(OAKLAND_COURSES);
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

const globalForDb = globalThis as unknown as { __golfDb?: Database.Database };

export const db: Database.Database = globalForDb.__golfDb ?? open();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__golfDb = db;
}
