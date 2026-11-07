import { supabase } from "@/lib/supabase";
import { saveProgress } from "@/services/library";

/** "Marcar como visto" — tudo salvo no Supabase. Filmes entram em watch_history (progress 100), o mesmo lugar de "Já assistidos". */

export async function isMovieWatched(profileId: string, mediaId: number): Promise<boolean> {
  const { data, error } = await supabase.from("watch_history").select("progress")
    .eq("profile_id", profileId).eq("media_id", mediaId).eq("media_type", "movie").maybeSingle();
  if (error) throw error;
  return (data?.progress ?? 0) >= 95;
}

export async function setMovieWatched(
  profileId: string, item: { media_id: number; title?: string; poster_path: string | null }, seen: boolean,
) {
  if (seen) { await saveProgress(profileId, { ...item, media_type: "movie" }, 100); return; }
  const { error } = await supabase.from("watch_history").delete()
    .eq("profile_id", profileId).eq("media_id", item.media_id).eq("media_type", "movie");
  if (error) throw error;
}

export interface EpKey { season: number; episode: number }
export const epKey = (season: number, episode: number) => `${season}x${episode}`;

export async function fetchSeenEpisodes(profileId: string, tvId: number): Promise<EpKey[]> {
  const { data, error } = await supabase.from("episodes_seen").select("season_number, episode_number")
    .eq("profile_id", profileId).eq("tv_id", tvId).limit(5000);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ season: r.season_number, episode: r.episode_number }));
}

export interface TvInfo { id: number; title: string; poster_path: string | null; totalEpisodes?: number }

/** Marca/desmarca episódios e mantém a série em watch_history coerente (100 quando tudo foi visto; volta a 94 se desmarcar). */
export async function setEpisodesSeen(profileId: string, tv: TvInfo, items: EpKey[], seen: boolean) {
  if (!items.length) return;
  if (seen) {
    const rows = items.map((e) => ({ profile_id: profileId, tv_id: tv.id, season_number: e.season, episode_number: e.episode }));
    const { error } = await supabase.from("episodes_seen").upsert(rows, { onConflict: "profile_id,tv_id,season_number,episode_number", ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const bySeason = new Map<number, number[]>();
    items.forEach((e) => bySeason.set(e.season, [...(bySeason.get(e.season) ?? []), e.episode]));
    for (const [season, eps] of bySeason) {
      const { error } = await supabase.from("episodes_seen").delete()
        .eq("profile_id", profileId).eq("tv_id", tv.id).eq("season_number", season).in("episode_number", eps);
      if (error) throw error;
    }
  }
  await syncSeriesWatched(profileId, tv, seen);
}

async function syncSeriesWatched(profileId: string, tv: TvInfo, justMarked: boolean) {
  try {
    if (justMarked) {
      const total = tv.totalEpisodes ?? 0;
      if (total <= 0) return;
      const { count, error } = await supabase.from("episodes_seen").select("id", { count: "exact", head: true })
        .eq("profile_id", profileId).eq("tv_id", tv.id).gt("season_number", 0);
      if (error) return;
      if ((count ?? 0) >= total) await saveProgress(profileId, { media_id: tv.id, media_type: "tv", title: tv.title, poster_path: tv.poster_path }, 100);
    } else {
      await supabase.from("watch_history").update({ progress: 94 })
        .eq("profile_id", profileId).eq("media_id", tv.id).eq("media_type", "tv").gte("progress", 95);
    }
  } catch { /* a marcação do episódio já foi salva; a sincronização da série tenta de novo na próxima */ }
}
