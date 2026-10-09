import { CONFIG } from "@/lib/config";
import { supabase } from "@/lib/supabase";

export interface Channel { name?: string; group?: string; logo?: string | null; stream: string }
export interface Category { name: string | null; count: number }
export interface ProgramInfo { titulo: string; inicio: string | null; fim: string | null }

const CACHE_KEY = "alxmovies_channel_cache";
const CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 12000;
const EPG_TIMEOUT_MS = 4000;
const TEST_TIMEOUT_MS = 2500;
export const TEST_CONCURRENCY = 30;

// ---------- favoritos (por perfil) ----------
export async function getFavoriteChannels(profileId: string): Promise<Channel[]> {
  const { data, error } = await supabase.from("channel_favorites").select("*").eq("profile_id", profileId).order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ name: r.channel_name, group: r.channel_group, logo: r.channel_logo, stream: r.channel_stream }));
}

export async function toggleChannelFavorite(profileId: string, channel: Channel, currentlyFavorite: boolean) {
  if (currentlyFavorite) {
    const { error } = await supabase.from("channel_favorites").delete().eq("profile_id", profileId).eq("channel_stream", channel.stream);
    if (error) throw error;
    return { active: false };
  }
  const { error } = await supabase.from("channel_favorites").insert({
    profile_id: profileId, channel_name: channel.name || "Canal", channel_group: channel.group || null,
    channel_logo: channel.logo || null, channel_stream: channel.stream,
  });
  if (error) throw error;
  return { active: true };
}

// ---------- catálogo ----------
const cleanGroup = (g?: string) => (g || "").trim().replace(/^canais\s*\|\s*/i, "").trim();
export const channelGroupLabel = (g?: string) => (g || "").replace(/^canais\s*\|\s*/i, "");

let catalogPromise: Promise<Channel[]> | null = null;
export function fetchAllChannels(): Promise<Channel[]> {
  if (!catalogPromise) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
    catalogPromise = fetch(CONFIG.CHANNELS_API_URL, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => (d?.success && Array.isArray(d.canais) ? (d.canais as Channel[]) : []))
      .catch(() => { catalogPromise = null; return [] as Channel[]; }) // permite tentar de novo depois
      .finally(() => clearTimeout(timeout));
  }
  return catalogPromise;
}

export async function getAvailableCategories(): Promise<Category[]> {
  const all = await fetchAllChannels();
  const counts = new Map<string, number>();
  let noGroup = 0;
  all.forEach((c) => {
    const clean = cleanGroup(c.group);
    if (!clean) { noGroup++; return; }
    if (/adult/i.test(clean)) return;
    counts.set(clean, (counts.get(clean) || 0) + 1);
  });
  const cats: Category[] = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name!.localeCompare(b.name!, "pt-BR"));
  if (noGroup > 0) cats.push({ name: null, count: noGroup });
  return cats;
}

export async function getChannelsInCategory(name: string | null): Promise<Channel[]> {
  const all = await fetchAllChannels();
  if (name === null) return all.filter((c) => !cleanGroup(c.group));
  return all.filter((c) => (c.group || "").toUpperCase().includes(name.toUpperCase()));
}

export async function searchChannels(text: string): Promise<Channel[]> {
  try {
    const d = await (await fetch(`${CONFIG.CHANNELS_API_URL}?query=${encodeURIComponent(text)}`)).json();
    return d?.success && Array.isArray(d.canais) ? d.canais : [];
  } catch { return []; }
}

export function guessCategoryIcon(name: string) {
  const n = name.toUpperCase();
  const rules: [RegExp, string][] = [
    [/GLOBO|RECORD|BAND|SBT|RTP|SIC|TVI/, "📺"], [/ESPN|SPORT|ESPORT|LUTA|UFC|MMA|COMBATE/, "⚽"], [/FILME|MOVIE|CINEMA|SERIE/, "🎬"],
    [/ANIME|GEEK|NERD/, "🎌"], [/INFANT|KIDS|CRIAN/, "🧸"], [/NOTIC|NEWS|JORNAL/, "📰"], [/NOVELA|SOAP/, "💫"],
    [/MUSIC|MÚSIC/, "🎵"], [/RELIGI|GOSPEL|FÉ\b/, "🙏"], [/DOC/, "🎥"],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? "📡";
}

// ---------- teste "está no ar?" com cache ----------
type Cache = Record<string, { online: boolean; testedAt: number }>;
const readCache = (): Cache => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") || {}; } catch { return {}; } };
const writeCache = (c: Cache) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* sem espaço/privado */ } };
const cached = (c: Cache, url: string) => {
  const e = c[url];
  return e && Date.now() - e.testedAt <= CACHE_TTL_MS ? e.online : null;
};

export async function testChannelOnline(url: string) {
  const attempt = async (method: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TEST_TIMEOUT_MS);
    try { await fetch(url, { method, signal: ctrl.signal, mode: "no-cors" }); return true; }
    catch { return false; }
    finally { clearTimeout(t); ctrl.abort(); }
  };
  return (await attempt("HEAD")) || attempt("GET");
}

export async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}

/** Testa e entrega cada canal assim que confirmado no ar; favoritos primeiro (em lote separado). */
export interface StreamOptions { maxToShow?: number; deadlineMs?: number | null; isCancelled?: () => boolean }

export async function streamOnlineChannels(
  profileId: string, onOnline: (c: Channel) => void,
  { maxToShow = 30, deadlineMs = null, isCancelled = () => false }: StreamOptions = {}
) {
  const all = await fetchAllChannels();
  if (!all.length) return;
  const favs = new Set((await getFavoriteChannels(profileId).catch(() => [])).map((f) => f.stream));
  const cache = readCache();
  const started = Date.now();
  let shown = 0;
  const stop = () => isCancelled() || (deadlineMs != null && Date.now() - started > deadlineMs);

  const handle = async (c: Channel) => {
    if (shown >= maxToShow || stop() || !c.stream) return;
    const hit = cached(cache, c.stream);
    if (hit === true) { shown++; onOnline(c); return; }
    if (hit === false) return;
    const online = await testChannelOnline(c.stream);
    cache[c.stream] = { online, testedAt: Date.now() };
    writeCache(cache);
    if (online && shown < maxToShow && !isCancelled()) { shown++; onOnline(c); }
  };

  const fav = all.filter((c) => favs.has(c.stream));
  const rest = all.filter((c) => !favs.has(c.stream));
  if (fav.length) await runWithConcurrency(fav, TEST_CONCURRENCY, handle);
  if (shown < maxToShow && !stop()) await runWithConcurrency(rest, TEST_CONCURRENCY, handle);
}

/** Canais confirmados no ar recentemente (só lê o cache) — contexto real para a IA. */
export async function getKnownOnlineChannels(limit = 15) {
  const all = await fetchAllChannels();
  const cache = readCache();
  return all.filter((c) => c.stream && cached(cache, c.stream) === true).slice(0, limit);
}

// ---------- guia de programação (falha em silêncio) ----------
const normalize = (r: any): ProgramInfo | null => (r?.titulo ? { titulo: r.titulo, inicio: r.inicio || null, fim: r.fim || null } : null);
export async function getChannelProgramGuide(stream: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), EPG_TIMEOUT_MS);
  try {
    const res = await fetch(`${CONFIG.EPG_API_URL}?stream=${encodeURIComponent(stream)}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.success ? { atual: normalize(d.atual), proximo: normalize(d.proximo) } : null;
  } catch { return null; }
  finally { clearTimeout(t); }
}

export async function removeFavoriteChannelByStream(profileId: string, stream: string) {
  const { error } = await supabase.from("channel_favorites").delete().eq("profile_id", profileId).eq("channel_stream", stream);
  if (error) throw error;
}
