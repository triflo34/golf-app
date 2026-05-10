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
  website: string | null;
  phone: string | null;
  created_at: string;
};

export type Round = {
  id: number;
  course_id: number;
  played_at: string;
  created_by: string;
  notes: string | null;
  created_at: string;
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
