import type HlsType from "hls.js";
import { CONFIG } from "./config";
import type { MediaType } from "@/types";

type Listener = (payload?: any) => void;

export interface LoadArgs { tmdbId: number; mediaType: MediaType; season?: number | null; episode?: number | null }

async function extractStream({ tmdbId, mediaType, season, episode }: LoadArgs) {
  const base = CONFIG.EXTRACTOR_BASE_URL;
  let url = `${base}/extract?tmdb_id=${tmdbId}&type=${mediaType || "movie"}`;
  if (mediaType === "tv" && season && episode) url += `&season=${season}&episode=${episode}`;
  const data = await (await fetch(url)).json();
  if (!data.success || !data.hlsUrl) throw new Error("Não foi possível carregar o vídeo.");
  return `${base}/proxy?url=${encodeURIComponent(data.hlsUrl)}&cookies=${encodeURIComponent(data.cookies || "")}`;
}

/** Player imperativo para as salas (sincronização) em cima de um <video>. */
export function createRoomPlayer(video: HTMLVideoElement) {
  let hls: HlsType | null = null;
  let suppressEcho = false;
  let destroyed = false;
  const listeners: Record<string, Listener[]> = {};
  const abort = new AbortController();

  const emit = (event: string, payload?: unknown) => {
    if (suppressEcho) return;
    (listeners[event] ?? []).forEach((cb) => cb(payload));
  };
  const domEvents: [string, () => void][] = [
    ["play", () => emit("play", { time: video.currentTime })],
    ["pause", () => emit("pause", { time: video.currentTime })],
    ["seeked", () => emit("seeking", { time: video.currentTime })],
    ["waiting", () => emit("waiting")],
    ["playing", () => emit("playing")],
    ["ended", () => emit("ended")],
    ["timeupdate", () => emit("timeupdate", { time: video.currentTime })],
  ];
  domEvents.forEach(([n, fn]) => video.addEventListener(n, fn, { signal: abort.signal }));

  return {
    on(event: string, cb: Listener) { (listeners[event] ??= []).push(cb); },

    async load(args: LoadArgs) {
      const { default: Hls } = await import("hls.js");
      const proxyUrl = await extractStream(args);
      if (destroyed) return;
      hls?.destroy(); hls = null;

      if (Hls.isSupported()) {
        const h = new Hls({
          maxBufferLength: 120, maxMaxBufferLength: 600, maxBufferSize: 60 * 1000 * 1000, backBufferLength: 90,
          enableWorker: true, lowLatencyMode: false,
          manifestLoadingTimeOut: 30000, manifestLoadingMaxRetry: 4,
          levelLoadingTimeOut: 30000, levelLoadingMaxRetry: 4,
          fragLoadingTimeOut: 60000, fragLoadingMaxRetry: 6,
        });
        hls = h;
        h.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
          else emit("error", d);
        });
        const parsed = new Promise<void>((resolve) => h.on(Hls.Events.MANIFEST_PARSED, () => resolve()));
        h.loadSource(proxyUrl);
        h.attachMedia(video);
        await parsed;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = proxyUrl;
        await new Promise<void>((resolve) => video.addEventListener("loadedmetadata", () => resolve(), { once: true }));
      } else {
        throw new Error("Seu navegador não suporta este player.");
      }
    },

    play: () => video.play().catch(() => {}),
    pause: () => video.pause(),
    seek: (s: number) => { video.currentTime = Math.max(0, s); },
    getCurrentTime: () => video.currentTime || 0,
    isPlaying: () => !video.paused && !video.ended,

    getQualityLevels: () => (hls ? hls.levels.map((l, i) => ({ index: i, height: l.height, bitrate: l.bitrate })) : []),
    getCurrentQualityLevel: () => (hls ? hls.currentLevel : -1),
    setQualityLevel: (i: number) => { if (hls) hls.currentLevel = i; },
    getSubtitleTracks: () => (hls ? hls.subtitleTracks.map((t, i) => ({ index: i, label: t.name || t.lang || `Faixa ${i + 1}` })) : []),
    getCurrentSubtitleTrack: () => (hls ? hls.subtitleTrack : -1),
    setSubtitleTrack: (i: number) => { if (!hls) return; hls.subtitleDisplay = i !== -1; hls.subtitleTrack = i; },

    /** Aplica comando vindo do anfitrião sem "ecoar" de volta como se fosse do usuário. */
    applyRemote(action: string, value?: number) {
      suppressEcho = true;
      try {
        if (action === "play") {
          if (typeof value === "number" && Math.abs(video.currentTime - value) > 1.5) video.currentTime = value;
          void video.play().catch(() => {});
        } else if (action === "pause") {
          if (typeof value === "number") video.currentTime = value;
          video.pause();
        } else if (action === "seek" && typeof value === "number") {
          video.currentTime = value;
        }
      } finally {
        setTimeout(() => { suppressEcho = false; }, 150);
      }
    },

    destroy() {
      destroyed = true;
      abort.abort();
      hls?.destroy(); hls = null;
    },
  };
}
export type RoomPlayer = ReturnType<typeof createRoomPlayer>;
