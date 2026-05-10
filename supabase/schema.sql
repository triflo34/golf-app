-- The Match - Golf Tracking App
-- Run this in the Supabase SQL Editor to set up your database

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile (on registration)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Courses table
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'MI',
  holes INTEGER DEFAULT 18,
  par INTEGER NOT NULL,
  slope_rating DECIMAL,
  course_rating DECIMAL,
  website TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Courses are viewable by everyone"
  ON courses FOR SELECT USING (true);

-- Rounds table (a group outing)
CREATE TABLE rounds (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) NOT NULL,
  played_at DATE NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rounds are viewable by everyone"
  ON rounds FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create rounds"
  ON rounds FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Round creator can update"
  ON rounds FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Round creator can delete"
  ON rounds FOR DELETE USING (auth.uid() = created_by);

-- Scores table (each player's score in a round)
CREATE TABLE scores (
  id SERIAL PRIMARY KEY,
  round_id INTEGER REFERENCES rounds(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES profiles(id) NOT NULL,
  gross_score INTEGER NOT NULL,
  handicap_index DECIMAL,
  net_score DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, player_id)
);

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scores are viewable by everyone"
  ON scores FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create scores"
  ON scores FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Score creator or round creator can update"
  ON scores FOR UPDATE USING (
    auth.uid() = player_id OR
    auth.uid() = (SELECT created_by FROM rounds WHERE id = round_id)
  );

CREATE POLICY "Round creator can delete scores"
  ON scores FOR DELETE USING (
    auth.uid() = (SELECT created_by FROM rounds WHERE id = round_id)
  );

-- Auto-create profile on signup via trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
