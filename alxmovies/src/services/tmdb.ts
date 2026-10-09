import { CONFIG } from "@/lib/config";
import type { MediaItem, MediaType, Paged } from "@/types";

async function tmdbFetch<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(CONFIG.TMDB_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      path: endpoint.replace(/^\/+/, ""),
      params: { language: "pt-BR", ...params },
    }),
  });
  if (!res.ok) throw new Error(`Erro TMDB: ${res.status}`);
  return res.json() as Promise<T>;
}

export const posterUrl = (path: string | null, size: string = CONFIG.POSTER_SIZE) =>
  path ? `${CONFIG.TMDB_IMG_BASE}/${size}${path}` : "/assets/no-poster.png";

export const backdropUrl = (path: string | null, size: string = CONFIG.BACKDROP_SIZE) =>
  path ? `${CONFIG.TMDB_IMG_BASE}/${size}${path}` : null;

export const tmdb = {
  trending: (type: MediaType = "movie", window: "day" | "week" = "week") =>
    tmdbFetch<Paged<MediaItem>>(`/trending/${type}/${window}`),
  popular: (type: MediaType = "movie", page = 1) =>
    tmdbFetch<Paged<MediaItem>>(`/${type}/popular`, { page }),
  byGenre: (type: MediaType, genreId: number, page = 1) =>
    tmdbFetch<Paged<MediaItem>>(`/discover/${type}`, { with_genres: genreId, page }),
  search: (query: string, type: MediaType | "multi" = "multi", page = 1) =>
    tmdbFetch<Paged<MediaItem>>(`/search/${type}`, { query, page }),
  recommendations: (type: MediaType, id: number, page = 1) =>
    tmdbFetch<Paged<MediaItem>>(`/${type}/${id}/recommendations`, { page }),
  genres: (type: MediaType = "movie") =>
    tmdbFetch<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`),

  async details(type: MediaType, id: number) {
    const data = await tmdbFetch<MediaItem & Record<string, any>>(`/${type}/${id}`, {
      append_to_response: "credits,videos,similar",
    });
    if (!data.overview) {
      try {
        const fb = await tmdbFetch<{ overview?: string }>(`/${type}/${id}`, { language: "en-US" });
        if (fb.overview) { data.overview = fb.overview; data._overviewFallback = true; }
      } catch {
        /* segue sem sinopse */
      }
    }
    return data;
  },
  collection: (id: number) => tmdbFetch<{ parts?: any[] }>(`/collection/${id}`),
  season: (tvId: number, season: number) => tmdbFetch<any>(`/tv/${tvId}/season/${season}`),
};
