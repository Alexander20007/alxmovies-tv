import { fetchContinueWatching, fetchMyList } from "./library";
import { tmdb } from "./tmdb";

export interface ContentNotification { kind: "stalled" | "sequel"; icon: string; text: string; id: number; media_type: "movie" | "tv"; poster_path: string | null }

const CONCURRENCY = 5;
const MAX_FAVORITES_CHECKED = 15;
const STALLED_AFTER_DAYS = 1;

async function pool<T>(items: T[], worker: (i: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

/** Sequências já lançadas dos filmes favoritados (usa "belongs_to_collection" real da TMDB). */
async function sequelAlerts(profileId: string) {
  const favorites = await fetchMyList(profileId).catch(() => []);
  const movies = favorites.filter((f) => f.media_type === "movie").slice(0, MAX_FAVORITES_CHECKED);
  const known = new Set(favorites.map((f) => f.media_id));
  const alerts: { source: string; id: number; title: string; poster_path: string | null }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  await pool(movies, async (fav) => {
    try {
      const d: any = await tmdb.details("movie", fav.media_id);
      if (!d.belongs_to_collection) return;
      const col = await tmdb.collection(d.belongs_to_collection.id);
      (col.parts ?? []).forEach((p: any) => {
        if (p.id === fav.media_id || known.has(p.id) || !p.release_date) return;
        if (d.release_date && p.release_date <= d.release_date) return; // mais antigo
        if (p.release_date > today) return; // ainda não saiu
        alerts.push({ source: fav.title ?? "", id: p.id, title: p.title, poster_path: p.poster_path });
      });
    } catch { /* ignora esse título */ }
  });
  return alerts;
}

export async function getContentNotifications(profileId: string): Promise<ContentNotification[]> {
  const [sequels, watching] = await Promise.all([
    sequelAlerts(profileId).catch(() => []),
    fetchContinueWatching(profileId).catch(() => []),
  ]);
  const out: ContentNotification[] = [];
  const last = watching[0];
  if (last?.watched_at && (Date.now() - new Date(last.watched_at).getTime()) / 86400000 >= STALLED_AFTER_DAYS) {
    out.push({ kind: "stalled", icon: "▶", text: `Você parou em "${last.title}" — continuar de onde ficou?`, id: last.media_id, media_type: last.media_type, poster_path: last.poster_path });
  }
  sequels.forEach((a) => out.push({
    kind: "sequel", icon: "🎬", text: `"${a.title}" já saiu — a sequência de "${a.source}" que você favoritou.`, id: a.id, media_type: "movie", poster_path: a.poster_path,
  }));
  return out;
}
