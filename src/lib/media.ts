import { tmdb } from "@/services/tmdb";
import type { MediaType } from "@/types";

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function lsGet(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* modo privado */ }
}
export function lsDel(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function storageKey(kind: string, profileId: string, type: MediaType, id: number, season?: number, episode?: number) {
  const base = `alxmovies_${kind}_${profileId}_${type}_${id}`;
  return type === "tv" && season != null ? `${base}_${season}_${episode}` : base;
}

export interface SeasonInfo { season_number: number; episode_count: number }
export interface HasSeasons { seasons?: SeasonInfo[]; [key: string]: any }
export function getSeasonsList(media: HasSeasons) {
  const all = (media.seasons ?? []).filter((s) => s.episode_count > 0);
  const regular = all.filter((s) => s.season_number > 0);
  return regular.length ? regular : all;
}

export interface EpRef { season: number; episode: number }

export function pickStartEpisode(
  media: HasSeasons, profileId: string, id: number, params: URLSearchParams
): EpRef {
  const qs = Number(params.get("s"));
  const qe = Number(params.get("e"));
  if (qs && qe) return { season: qs, episode: qe };
  try {
    const last = JSON.parse(lsGet(storageKey("lastep", profileId, "tv", id)) ?? "null");
    if (last?.season && last?.episode) return last;
  } catch { /* ignore */ }
  const first = getSeasonsList(media)[0];
  return { season: first ? first.season_number : 1, episode: 1 };
}

export interface EpisodeInfo { number: number; name: string; still: string | null; runtime?: number; overview?: string; airDate?: string }
const seasonCache = new Map<string, EpisodeInfo[]>();

export async function ensureSeason(tvId: number, season: number): Promise<EpisodeInfo[]> {
  const key = `${tvId}_${season}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const data = await tmdb.season(tvId, season);
  const eps: EpisodeInfo[] = (data.episodes ?? []).map((ep: any) => ({
    number: ep.episode_number, name: ep.name, still: ep.still_path,
    runtime: ep.runtime, overview: ep.overview, airDate: ep.air_date,
  }));
  seasonCache.set(key, eps);
  return eps;
}

/** Tela cheia + trava em paisagem (precisa ser chamada dentro de um gesto do usuário). */
export function enterFullscreenLandscape(el: HTMLElement) {
  const req = el.requestFullscreen?.bind(el);
  if (!req) return;
  void req()
    .then(() => (screen.orientation as any)?.lock?.("landscape")?.catch(() => {}))
    .catch(() => {});
}

const PREFS_KEY = "alxmovies_player_prefs";
export interface PlayerPrefs { volume?: number; muted?: boolean; rate?: number }
export function loadPlayerPrefs(): PlayerPrefs {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
export function savePlayerPrefs(p: PlayerPrefs) { lsSet(PREFS_KEY, JSON.stringify(p)); }

export function formatDateBR(iso?: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const seasonLabel = (n: number) => (n === 0 ? "Especiais" : `Temporada ${n}`);

export function getLastEpisode(profileId: string, id: number): EpRef | null {
  try {
    const last = JSON.parse(lsGet(storageKey("lastep", profileId, "tv", id)) ?? "null");
    if (last?.season && last?.episode) return last;
  } catch { /* ignore */ }
  return null;
}
