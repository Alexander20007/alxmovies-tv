export type MediaType = "movie" | "tv";

export interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  adult?: boolean;
  media_type?: MediaType | "person";
}

export interface Paged<T> {
  page: number;
  results: T[];
  total_pages: number;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  avatar?: string | null;
  color_theme?: string | null;
  is_kids?: boolean;
  is_admin?: boolean;
  maturity_rating?: string | null;
  pin?: string | null;
  age?: number | null;
  birthday?: string | null;
  favorite_genres?: number[] | null;
  time_restriction_enabled?: boolean;
  allowed_start_time?: string | null;
  allowed_end_time?: string | null;
  created_at: string;
}

export interface HistoryItem {
  id: string;
  profile_id: string;
  media_id: number;
  media_type: MediaType;
  title?: string;
  poster_path: string | null;
  progress: number | null;
  watched_at: string;
}

export interface FavoriteItem {
  id: string;
  profile_id: string;
  media_id: number;
  media_type: MediaType;
  title?: string;
  poster_path: string | null;
  added_at: string;
}
