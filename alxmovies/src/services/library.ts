import { supabase } from "@/lib/supabase";
import type { FavoriteItem, HistoryItem, MediaItem, MediaType } from "@/types";

export async function fetchContinueWatching(profileId: string, limit = 20) {
  const { data, error } = await supabase
    .from("watch_history")
    .select("*")
    .eq("profile_id", profileId)
    .order("watched_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as HistoryItem[]).filter((i) => (i.progress ?? 0) < 95);
}

export async function fetchWatched(profileId: string, limit = 20) {
  const { data, error } = await supabase
    .from("watch_history")
    .select("*")
    .eq("profile_id", profileId)
    .order("watched_at", { ascending: false })
    .limit(limit * 3);
  if (error) throw error;
  return (data as HistoryItem[]).filter((i) => (i.progress ?? 0) >= 95).slice(0, limit);
}

export async function fetchMyList(profileId: string) {
  const { data, error } = await supabase
    .from("favorites")
    .select("*")
    .eq("profile_id", profileId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data as FavoriteItem[];
}

export async function isFavorite(profileId: string, mediaId: number, mediaType: MediaType) {
  const { data, error } = await supabase
    .from("favorites").select("id")
    .eq("profile_id", profileId).eq("media_id", mediaId).eq("media_type", mediaType)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function addFavorite(profileId: string, mediaType: MediaType, media: MediaItem & Record<string, any>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");
  const { error } = await supabase.from("favorites").insert({
    user_id: user.id,
    profile_id: profileId,
    media_id: media.id,
    media_type: mediaType,
    movie_data: media,
    title: media.title || media.name || null,
    poster_path: media.poster_path || null,
    overview: media.overview || null,
    vote_average: media.vote_average ?? null,
    backdrop_path: media.backdrop_path || null,
    release_date: media.release_date || media.first_air_date || null,
    original_title: media.original_title || media.original_name || null,
    genre_ids: media.genre_ids ? JSON.stringify(media.genre_ids) : null,
    popularity: media.popularity ?? null,
    vote_count: media.vote_count ?? null,
    added_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function removeFavorite(profileId: string, mediaId: number, mediaType: MediaType) {
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("profile_id", profileId)
    .eq("media_id", mediaId)
    .eq("media_type", mediaType);
  if (error) throw error;
}

export async function saveProgress(
  profileId: string,
  item: { media_id: number; media_type: MediaType; title?: string; poster_path: string | null },
  percent: number
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");
  const { error } = await supabase.from("watch_history").upsert(
    {
      user_id: user.id,
      profile_id: profileId,
      ...item,
      progress: Math.round(Math.min(100, Math.max(0, percent))),
      watched_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,media_id,media_type" }
  );
  if (error) throw error;
}
