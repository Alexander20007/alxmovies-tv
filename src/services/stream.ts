import { CONFIG } from "@/lib/config";
import { apiFetch } from "@/lib/proxy";
import type { MediaType } from "@/types";

const SLOW_AFTER_MS = 6000;
const GIVE_UP_AFTER_MS = 90000;
const PRIORITY_SERVER = "VIP Player";
const PROXY_REFERER = "https://embedplayer2.xyz/";

export interface StreamRequest { type: MediaType; id: number; season?: number; episode?: number }
export interface StreamResult {
  /** de qual API veio o link: a principal (alx-api) ou a reserva (a do player das salas) */
  source: "main" | "fallback";
  title: string;
  m3u8: string;
  server: string;
  servers: { label: string; ok: boolean }[];
  nextEpisode: { season: number; episode: number } | null;
  expiresAt: number | null;
  cached: boolean;
}
interface Opts extends StreamRequest { server?: string | null; onSlow?: () => void }
export interface ResolveOpts extends Opts {
  /** usa só a API reserva (ex.: o vídeo da principal falhou no meio da reprodução) */
  fallbackOnly?: boolean;
}

/** Nome do "servidor" que representa a API reserva no menu do player. */
export const FALLBACK_SERVER = "Reserva";

const base = () => CONFIG.STREAM_BASE_URL.replace(/\/+$/, "");
/** Links de vídeo (player/1DM): rota de mídia do proxy, pois esses pedidos não carregam JWT/nonce. */
const mediaBase = () => CONFIG.STREAM_MEDIA_URL.replace(/\/+$/, "");

async function requestOnce(o: Opts, controller: AbortController) {
  let url = o.type === "tv"
    ? `${base()}/api/stream/tv/${o.id}/${o.season}/${o.episode}`
    : `${base()}/api/stream/movie/${o.id}`;
  if (o.server) url += `?servidor=${encodeURIComponent(o.server)}`;

  const slow = setTimeout(() => o.onSlow?.(), SLOW_AFTER_MS);
  let data: any = null;
  try {
    let res: Response;
    try {
      res = await apiFetch(url, { signal: controller.signal });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw new Error("O servidor de vídeo demorou demais para responder. Tente de novo.");
      await new Promise((r) => setTimeout(r, 1200));
      res = await apiFetch(url, { signal: controller.signal }).catch(() => {
        throw new Error("Sem conexão com o servidor de vídeo. Verifique sua internet.");
      });
    }
    data = await res.json().catch(() => null);
  } finally {
    clearTimeout(slow);
  }
  if (!data?.status || !data.m3u8) throw new Error(data?.erro || "Este vídeo não está disponível no momento.");
  return data;
}

export async function fetchStream(o: Opts): Promise<StreamResult> {
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), GIVE_UP_AFTER_MS);
  let data: any;
  try {
    if (o.server) data = await requestOnce(o, controller);
    else {
      try { data = await requestOnce({ ...o, server: PRIORITY_SERVER }, controller); }
      catch { data = await requestOnce({ ...o, server: null }, controller); }
    }
  } finally {
    clearTimeout(kill);
  }

  // O servidor prioritário não libera CORS: precisa passar pelo proxy da API
  const m3u8 = data.servidor === PRIORITY_SERVER
    ? `${mediaBase()}/api/proxy?url=${encodeURIComponent(data.m3u8)}&referer=${encodeURIComponent(PROXY_REFERER)}`
    : data.m3u8;
  const n = data.proximo_episodio;
  return {
    source: "main",
    title: data.titulo || "",
    m3u8,
    server: data.servidor || "",
    servers: (data.servidores_disponiveis ?? []).map((s: any) => ({ label: s.label, ok: s.budget === "success" })),
    nextEpisode: n?.season && n?.episode ? { season: Number(n.season), episode: Number(n.episode) } : null,
    expiresAt: data.expires_at ? data.expires_at * 1000 : null,
    cached: !!data.cache,
  };
}

// ---------- API reserva (a mesma lógica que já existia no player das salas) ----------
const FALLBACK_AFTER_MS = 8000;   // se a principal demorar mais que isso, a reserva começa a carregar em segundo plano
const FALLBACK_GIVE_UP_MS = 60000;

export async function fetchFallbackStream({ type, id, season, episode }: StreamRequest): Promise<StreamResult> {
  const fb = CONFIG.EXTRACTOR_BASE_URL.replace(/\/+$/, "");
  const fbMedia = CONFIG.EXTRACTOR_MEDIA_URL.replace(/\/+$/, ""); // links de vídeo: rota de mídia do proxy
  let url = `${fb}/extract?tmdb_id=${id}&type=${type || "movie"}`;
  if (type === "tv" && season && episode) url += `&season=${season}&episode=${episode}`;

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), FALLBACK_GIVE_UP_MS);
  try {
    const res = await apiFetch(url, { signal: controller.signal });
    const data = await res.json().catch(() => null);
    if (!data?.success || !data.hlsUrl) throw new Error("Não foi possível carregar o vídeo.");
    return {
      source: "fallback",
      title: "",
      m3u8: `${fbMedia}/proxy?url=${encodeURIComponent(data.hlsUrl)}&cookies=${encodeURIComponent(data.cookies || "")}`,
      server: FALLBACK_SERVER,
      servers: [],
      nextEpisode: null,
      expiresAt: null,
      cached: false,
    };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("O servidor de vídeo demorou demais para responder. Tente de novo.");
    throw e instanceof Error ? e : new Error("Não foi possível carregar o vídeo.");
  } finally {
    clearTimeout(kill);
  }
}

/**
 * Ponto único de entrada dos dois players (tela de assistir e salas).
 * 1) tenta a API principal; 2) se ela estiver offline, não achar o link, ou demorar mais de {@link FALLBACK_AFTER_MS},
 * a API reserva carrega em segundo plano e vale o primeiro link que chegar.
 * Se o usuário escolheu um servidor específico, só a principal é usada.
 */
export function resolveStream(o: ResolveOpts): Promise<StreamResult> {
  if (o.fallbackOnly) return fetchFallbackStream(o);
  if (o.server) return fetchStream(o);

  return new Promise<StreamResult>((resolve, reject) => {
    let settled = false;
    let mainErr: unknown = null;
    let fbStarted = false, fbFailed = false, mainFailed = false;
    let timer: ReturnType<typeof setTimeout>;

    const win = (r: StreamResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    const lose = () => {
      if (settled || !mainFailed || !fbFailed) return;
      settled = true; clearTimeout(timer);
      reject(mainErr instanceof Error ? mainErr : new Error("Este vídeo não está disponível no momento."));
    };
    const startFallback = () => {
      if (fbStarted || settled) return;
      fbStarted = true;
      fetchFallbackStream(o).then(win, () => { fbFailed = true; lose(); });
    };

    timer = setTimeout(startFallback, FALLBACK_AFTER_MS);
    fetchStream(o).then(win, (e) => { mainErr = e; mainFailed = true; startFallback(); lose(); });
  });
}
