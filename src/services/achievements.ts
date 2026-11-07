import { getFavoriteChannels, runWithConcurrency } from "./channels";
import { fetchMyList, fetchWatched } from "./library";
import { tmdb } from "./tmdb";

const MAX_ITEMS_FOR_GENRE_STATS = 30; // só uma amostra recente, não o histórico inteiro
const GENRE_FETCH_CONCURRENCY = 6;

export interface GenreStat { name: string; count: number }
export interface Badge { icon: string; label: string; detail: string }

/** Conta os títulos (assistidos + favoritos recentes) por gênero real da TMDB, do mais frequente ao menos. */
export async function getGenreStats(profileId: string): Promise<GenreStat[]> {
  const [watched, favorites] = await Promise.all([
    fetchWatched(profileId, MAX_ITEMS_FOR_GENRE_STATS).catch(() => []),
    fetchMyList(profileId).catch(() => []),
  ]);
  const seen = new Set<string>();
  const items: { media_id: number; media_type: "movie" | "tv" }[] = [];
  [...watched, ...favorites].forEach((i) => {
    const k = `${i.media_type}-${i.media_id}`;
    if (seen.has(k)) return;
    seen.add(k); items.push(i);
  });

  const counts = new Map<string, number>();
  await runWithConcurrency(items.slice(0, MAX_ITEMS_FOR_GENRE_STATS), GENRE_FETCH_CONCURRENCY, async (item) => {
    try {
      const d = await tmdb.details(item.media_type, item.media_id);
      (d.genres ?? []).forEach((g) => counts.set(g.name, (counts.get(g.name) || 0) + 1));
    } catch { /* ignora esse título */ }
  });
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/** Conquistas baseadas em números reais: assistidos, favoritos, canais favoritos e gênero mais frequente. */
export async function getAchievements(profileId: string): Promise<Badge[]> {
  const [watched, favorites, channels, genres] = await Promise.all([
    fetchWatched(profileId, 200).catch(() => []),
    fetchMyList(profileId).catch(() => []),
    getFavoriteChannels(profileId).catch(() => []),
    getGenreStats(profileId).catch(() => []),
  ]);
  const badges: Badge[] = [];
  if (watched.length >= 1) badges.push({ icon: "🎬", label: "Primeiro filme", detail: "Assistiu o primeiro título" });
  if (watched.length >= 10) badges.push({ icon: "🍿", label: "Maratonista", detail: `${watched.length} títulos assistidos` });
  if (watched.length >= 25) badges.push({ icon: "🏆", label: "Cinéfilo", detail: `${watched.length} títulos assistidos` });
  if (favorites.length >= 10) badges.push({ icon: "❤️", label: "Curador", detail: `${favorites.length} favoritos` });
  if (channels.length >= 5) badges.push({ icon: "📡", label: "Zapper", detail: `${channels.length} canais favoritos` });
  const top = genres[0];
  if (top && top.count >= 5) badges.push({ icon: "🎯", label: `Fã de ${top.name}`, detail: `${top.count} títulos desse gênero` });
  return badges;
}
