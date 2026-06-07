export type User = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
};

export type Course = {
  id: number;
  name: string;
  address: string | null;
  city: string;
  state: string;
  holes: number;
  par: number;
  slope_rating: number | null;
  course_rating: number | null;
  front_9_rating: number | null;
  front_9_slope: number | null;
  back_9_rating: number | null;
  back_9_slope: number | null;
  website: string | null;
  phone: string | null;
  created_at: string;
  external_id: string | null;
  last_fetched_at: string | null;
};

export type Round = {
  id: number;
  course_id: number;
  played_at: string;
  created_by: string;
  notes: string | null;
  created_at: string;
  event_id: number | null;
  scoring_mode: ScoringMode;
  round_number: number | null;
  round_format: RoundFormat;
  course?: Course;
  scores?: Score[];
};

export type Score = {
  id: number;
  round_id: number;
  player_id: string;
  gross_score: number;
  handicap_index: number | null;
  net_score: number | null;
  notes: string | null;
  created_at: string;
  player?: User;
};

// ===== Golfapalooza event module =====

export type EventStatus = "draft" | "open" | "in_progress" | "completed" | "archived";
export type ScoringMode = "total" | "hole_by_hole";
export type RoundFormat = "individual" | "scramble";
export type EventRole = "organizer" | "player";
export type SideGameKind =
  | "poker"
  | "best18"
  | "worst18"
  | "most_same"
  | "scramble_winners"
  | "stableford";

export type GolfEvent = {
  id: number;
  name: string;
  course_id: number;
  start_date: string;
  end_date: string;
  entry_fee_cents: number;
  description: string | null;
  status: EventStatus;
  exclude_from_leaderboard: boolean;
  created_by: string;
  created_at: string;
};

export type EventParticipant = {
  event_id: number;
  user_id: string;
  role: EventRole;
  group_num: number | null;
  user?: User;
};

export type CourseHole = {
  course_id: number;
  hole_number: number;
  par: number;
  handicap_index: number | null;
};

export type HoleScore = {
  id: number;
  round_id: number;
  player_id: string;
  hole_number: number;
  strokes: number;
  updated_by: string | null;
  updated_at: string;
};

export type ScoreEdit = {
  id: number;
  hole_score_id: number | null;
  round_id: number;
  player_id: string;
  hole_number: number;
  old_strokes: number | null;
  new_strokes: number | null;
  edited_by: string;
  edited_at: string;
};

export type ScrambleTeam = {
  id: number;
  round_id: number;
  name: string;
  members?: User[];
};

export type TeamHoleScore = {
  id: number;
  team_id: number;
  hole_number: number;
  strokes: number;
  updated_by: string | null;
  updated_at: string;
};

export type SideGame = {
  id: number;
  event_id: number;
  kind: SideGameKind;
  pot_cents: number;
  config: Record<string, unknown> | null;
};

export type SideGameResult = {
  id: number;
  side_game_id: number;
  player_id: string | null;
  team_id: number | null;
  rank: number | null;
  payout_cents: number;
};

export type PokerCard = {
  deck: number; // 0-based deck index for multi-deck events
  suit: "S" | "H" | "D" | "C";
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K";
};

export type PokerHand = {
  event_id: number;
  player_id: string;
  cards: PokerCard[];
  wild_count: number;
  bogey_count: number;
};

export type PokerDeckState = {
  event_id: number;
  num_decks: number;
  drawn: PokerCard[];
};

export type PokerSwap = {
  id: number;
  event_id: number;
  player_id: string;
  incoming_card: PokerCard | null;
  delta: number;
  resolved_at: string | null;
  swapped_card: PokerCard | null;
  created_at: string;
};
