import { CONFIG } from "@/lib/config";
import type { MediaType } from "@/types";

const SLOW_AFTER_MS = 6000;
const GIVE_UP_AFTER_MS = 90000;
const PRIORITY_SERVER = "VIP Player";
const PROXY_REFERER = "https://embedplayer2.xyz/";

export interface StreamRequest { type: MediaType; id: number; season?: number; episode?: number }
export interface StreamResult {
  title: string;
  m3u8: string;
  server: string;
  servers: { label: string; ok: boolean }[];
  nextEpisode: { season: number; episode: number } | null;
  expiresAt: number | null;
  cached: boolean;
}
interface Opts extends StreamRequest { server?: string | null; onSlow?: () => void }

const base = () => CONFIG.STREAM_BASE_URL.replace(/\/+$/, "");

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
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw new Error("O servidor de vídeo demorou demais para responder. Tente de novo.");
      await new Promise((r) => setTimeout(r, 1200));
      res = await fetch(url, { signal: controller.signal }).catch(() => {
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
    ? `${base()}/api/proxy?url=${encodeURIComponent(data.m3u8)}&referer=${encodeURIComponent(PROXY_REFERER)}`
    : data.m3u8;
  const n = data.proximo_episodio;
  return {
    title: data.titulo || "",
    m3u8,
    server: data.servidor || "",
    servers: (data.servidores_disponiveis ?? []).map((s: any) => ({ label: s.label, ok: s.budget === "success" })),
    nextEpisode: n?.season && n?.episode ? { season: Number(n.season), episode: Number(n.episode) } : null,
    expiresAt: data.expires_at ? data.expires_at * 1000 : null,
    cached: !!data.cache,
  };
}
