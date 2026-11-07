import type HlsType from "hls.js";
import { resolveStream } from "@/services/stream";
import type { MediaType } from "@/types";

type Listener = (payload?: any) => void;

export interface LoadArgs { tmdbId: number; mediaType: MediaType; season?: number | null; episode?: number | null }

export interface RoomPlayerApi {
  /** Eventos de controle (com "eco" bloqueado durante comandos remotos): play, pause, seeking, waiting, playing, ended, error.
   *  Eventos de estado para a interface (nunca bloqueados): state:play, state:pause, state:time, state:tracks, state:waiting, state:playing. */
  on(event: string, cb: (payload?: any) => void): void;
  load(args: LoadArgs, opts?: { fallbackOnly?: boolean }): Promise<void>;
  play(): Promise<void> | void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  isPlaying(): boolean;
  getQualityLevels(): { index: number; height: number; bitrate: number }[];
  getCurrentQualityLevel(): number;
  setQualityLevel(index: number): void;
  getSubtitleTracks(): { index: number; label: string }[];
  getCurrentSubtitleTrack(): number;
  setSubtitleTrack(index: number): void;
  setVolume(percent: number): void;
  applyRemote(action: string, value?: number): void;
  destroy(): void;
}

/** Player imperativo para as salas (sincronização) em cima de um <video> (versão web). */
export function createRoomPlayer(video: HTMLVideoElement): RoomPlayerApi {
  let hls: HlsType | null = null;
  let suppressEcho = false;
  let destroyed = false;
  let lastArgs: LoadArgs | null = null;
  let onFallback = false;
  const listeners: Record<string, Listener[]> = {};
  const abort = new AbortController();

  const emit = (event: string, payload?: unknown) => {
    if (suppressEcho) return;
    (listeners[event] ?? []).forEach((cb) => cb(payload));
  };
  const state = (event: string, payload?: unknown) => (listeners["state:" + event] ?? []).forEach((cb) => cb(payload));
  const domEvents: [string, () => void][] = [
    ["play", () => { state("play"); emit("play", { time: video.currentTime }); }],
    ["pause", () => { state("pause"); emit("pause", { time: video.currentTime }); }],
    ["seeked", () => emit("seeking", { time: video.currentTime })],
    ["waiting", () => { state("waiting"); emit("waiting"); }],
    ["playing", () => { state("playing"); emit("playing"); }],
    ["ended", () => emit("ended")],
    ["timeupdate", () => { state("time", { time: video.currentTime, duration: video.duration }); emit("timeupdate", { time: video.currentTime }); }],
  ];
  domEvents.forEach(([n, fn]) => video.addEventListener(n, fn, { signal: abort.signal }));

  return {
    on(event: string, cb: Listener) { (listeners[event] ??= []).push(cb); },

    /**
     * Mesma API do player principal; se ela estiver offline ou não achar o vídeo, a API reserva
     * (a antiga das salas) carrega sozinha em segundo plano. Se o vídeo da principal quebrar de vez
     * durante a reprodução, recarrega pela reserva retomando do mesmo ponto.
     */
    async load(args: LoadArgs, opts: { fallbackOnly?: boolean } = {}): Promise<void> {
      lastArgs = args;
      const { default: Hls } = await import("hls.js");
      const stream = await resolveStream({
        type: args.mediaType || "movie", id: args.tmdbId,
        season: args.season ?? undefined, episode: args.episode ?? undefined,
        fallbackOnly: opts.fallbackOnly,
      });
      const proxyUrl = stream.m3u8;
      onFallback = stream.source === "fallback";
      if (destroyed) return;
      hls?.destroy(); hls = null;

      // Quando o vídeo da API principal quebra de vez, recarrega pela reserva e devolve o resultado para quem está esperando este load()
      let handoff: ((p: Promise<void>) => void) | null = null;
      const switchToFallback = () => {
        if (onFallback || destroyed || !lastArgs || !handoff) return false;
        const at = video.currentTime || 0;
        const next = this.load(lastArgs, { fallbackOnly: true }).then(() => { if (at > 3) video.currentTime = at; });
        next.catch((e) => emit("error", e));
        handoff(next);
        return true;
      };

      if (Hls.isSupported()) {
        const h = new Hls({
          maxBufferLength: 120, maxMaxBufferLength: 600, maxBufferSize: 60 * 1000 * 1000, backBufferLength: 90,
          enableWorker: true, lowLatencyMode: false,
          manifestLoadingTimeOut: 30000, manifestLoadingMaxRetry: 4,
          levelLoadingTimeOut: 30000, levelLoadingMaxRetry: 4,
          fragLoadingTimeOut: 60000, fragLoadingMaxRetry: 6,
        });
        hls = h;
        let netErrors = 0, mediaErrors = 0;
        h.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (++netErrors > 3 && switchToFallback()) return;
            h.startLoad();
          } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (++mediaErrors > 1 && switchToFallback()) return;
            h.recoverMediaError();
          } else if (!switchToFallback()) emit("error", d);
        });
        const parsed = new Promise<void>((resolve, reject) => {
          h.on(Hls.Events.MANIFEST_PARSED, () => resolve());
          handoff = (p) => p.then(resolve, reject);
        });
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
    setVolume: (percent: number) => { video.volume = Math.max(0, Math.min(1, percent / 100)); },
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
export type RoomPlayer = RoomPlayerApi;
