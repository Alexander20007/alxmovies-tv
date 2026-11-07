import { CONFIG } from "@/lib/config";
import { apiFetch } from "@/lib/proxy";
import type { MediaItem, MediaType, Paged } from "@/types";

const CACHE_PREFIX = "alx_tmdb_v1:";
const CACHE_TTL_MS = 20 * 60_000;
const memCache = new Map<string, { t: number; v: unknown }>();

function cacheGet(key: string): { t: number; v: unknown } | null {
  const m = memCache.get(key);
  if (m) return m;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw) { const e = JSON.parse(raw); memCache.set(key, e); return e; }
  } catch { /* sem armazenamento */ }
  return null;
}
function cachePut(key: string, v: unknown) {
  const e = { t: Date.now(), v };
  memCache.set(key, e);
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(e)); }
  catch { /* cheio: limpa o cache antigo e segue só com a memória */
    try { Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  }
}

/** Cache de 20 min (poupa pedidos ao proxy/nonces) e, se o pedido falhar, devolve o último resultado guardado em vez de erro. */
async function tmdbFetch<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
  const body = { path: endpoint.replace(/^\/+/, ""), params: { language: "pt-BR", ...params } };
  const key = JSON.stringify(body);
  const hit = cacheGet(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v as T;
  try {
    const res = await apiFetch(CONFIG.TMDB_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Erro TMDB: ${res.status}`);
    const data = (await res.json()) as T;
    cachePut(key, data);
    return data;
  } catch (err) {
    if (hit) return hit.v as T; // melhor mostrar o conteúdo guardado do que uma tela vazia
    throw err;
  }
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
      append_to_response: "credits,videos,similar,release_dates,content_ratings",
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
  videos: (type: MediaType, id: number) =>
    tmdbFetch<{ results: { key: string; site: string; type: string; official?: boolean; iso_639_1?: string; name?: string }[] }>(
      `/${type}/${id}/videos`, { include_video_language: "pt,en,null" }),
  async person(id: number) {
    const data = await tmdbFetch<Record<string, any>>(`/person/${id}`, { append_to_response: "combined_credits" });
    if (!data.biography) {
      try {
        const fb = await tmdbFetch<{ biography?: string }>(`/person/${id}`, { language: "en-US" });
        if (fb.biography) { data.biography = fb.biography; data._bioFallback = true; }
      } catch { /* segue sem biografia */ }
    }
    return data;
  },
  collection: (id: number) => tmdbFetch<{ parts?: any[] }>(`/collection/${id}`),
  season: (tvId: number, season: number) => tmdbFetch<any>(`/tv/${tvId}/season/${season}`),
};
