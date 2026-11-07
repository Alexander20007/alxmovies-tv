import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { resolveStream } from "@/services/stream";
import type { LoadArgs, RoomPlayerApi } from "@/lib/roomPlayer";

interface Bounds { x: number; y: number; w: number; h: number }
interface RoomEvent {
  event: "time" | "play" | "pause" | "seeking" | "waiting" | "playing" | "ready" | "ended" | "tracks" | "error" | "resumed";
  timeMs?: number; durationMs?: number; playing?: boolean; message?: string;
  levels?: { index: number; height: number; bitrate: number }[]; subs?: { index: number; label: string }[]; quality?: number; sub?: number;
}
interface RoomPlugin {
  open(b: Bounds): Promise<void>;
  load(o: { url: string; startMs?: number }): Promise<void>;
  setBounds(b: Bounds & { visible: boolean }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(o: { ms: number }): Promise<void>;
  setVolume(o: { v: number }): Promise<void>;
  setQuality(o: { index: number }): Promise<void>;
  setSubtitle(o: { index: number }): Promise<void>;
  close(): Promise<void>;
  addListener(name: "room", cb: (e: RoomEvent) => void): Promise<PluginListenerHandle>;
}
const Native = registerPlugin<RoomPlugin>("AlxRoomPlayer");

/**
 * Player das salas com ExoPlayer NATIVO. O vídeo é desenhado pelo Android atrás da página (o WebView fica transparente);
 * `stage` é o quadro da página onde o vídeo deve aparecer — a posição é enviada ao nativo sempre que muda.
 * Mesma interface do player web (RoomPlayerApi), então a sincronização da sala não muda.
 */
export function createNativeRoomPlayer(stage: HTMLElement): RoomPlayerApi {
  const listeners: Record<string, ((p?: any) => void)[]> = {};
  let destroyed = false, suppressEcho = false, opened = false, onFallback = false;
  let time = 0, duration = 0, playing = false, lastUpdate = Date.now();
  let levels: { index: number; height: number; bitrate: number }[] = [];
  let subs: { index: number; label: string }[] = [];
  let qNow = -1, sNow = -1;
  let lastArgs: LoadArgs | null = null;
  let pending: { resolve: () => void; reject: (e: Error) => void } | null = null;
  let lastRect = "";
  let handle: PluginListenerHandle | null = null;

  const emit = (event: string, payload?: unknown) => { if (!suppressEcho) (listeners[event] ?? []).forEach((cb) => cb(payload)); };
  const state = (event: string, payload?: unknown) => (listeners["state:" + event] ?? []).forEach((cb) => cb(payload));

  const sendBounds = (force = false) => {
    if (destroyed || !opened) return;
    const r = stage.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && !document.hidden;
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${visible}`;
    if (!force && key === lastRect) return;
    lastRect = key;
    void Native.setBounds({ x: r.left, y: r.top, w: r.width, h: r.height, visible }).catch(() => {});
  };
  const onLayout = () => sendBounds();
  const ro = new ResizeObserver(onLayout);
  ro.observe(stage);
  window.addEventListener("scroll", onLayout, true);
  window.addEventListener("resize", onLayout);
  window.addEventListener("orientationchange", onLayout);
  const poll = window.setInterval(onLayout, 300); // rede de segurança (animações, teclado, barras)

  const api: RoomPlayerApi = {
    on(event, cb) { (listeners[event] ??= []).push(cb); },

    async load(args, opts = {}) {
      lastArgs = args;
      const stream = await resolveStream({
        type: args.mediaType || "movie", id: args.tmdbId, season: args.season ?? undefined, episode: args.episode ?? undefined,
        fallbackOnly: opts.fallbackOnly,
      });
      onFallback = stream.source === "fallback";
      if (destroyed) return;
      if (!opened) {
        const r = stage.getBoundingClientRect();
        await Native.open({ x: r.left, y: r.top, w: r.width, h: r.height });
        opened = true;
        handle = await Native.addListener("room", handleEvent);
        sendBounds(true);
      }
      const ready = new Promise<void>((resolve, reject) => {
        const t = window.setTimeout(() => { pending = null; reject(new Error("O vídeo demorou demais para carregar.")); }, 45000);
        pending = { resolve: () => { clearTimeout(t); resolve(); }, reject: (e) => { clearTimeout(t); reject(e); } };
      });
      await Native.load({ url: stream.m3u8 });
      await ready;
    },

    play: () => Native.play().catch(() => {}),
    pause: () => { void Native.pause().catch(() => {}); },
    seek: (s) => { time = Math.max(0, s); lastUpdate = Date.now(); void Native.seekTo({ ms: Math.round(time * 1000) }).catch(() => {}); },
    getCurrentTime: () => (playing ? time + (Date.now() - lastUpdate) / 1000 : time),
    isPlaying: () => playing,

    getQualityLevels: () => levels,
    getCurrentQualityLevel: () => qNow,
    setQualityLevel: (i) => { qNow = i; void Native.setQuality({ index: i }).catch(() => {}); },
    getSubtitleTracks: () => subs,
    getCurrentSubtitleTrack: () => sNow,
    setSubtitleTrack: (i) => { sNow = i; void Native.setSubtitle({ index: i }).catch(() => {}); },
    setVolume: (percent) => { void Native.setVolume({ v: percent }).catch(() => {}); },

    /** Comando vindo do anfitrião: não pode "ecoar" de volta (o nativo responde um instante depois, por isso a janela de 700 ms). */
    applyRemote(action, value) {
      suppressEcho = true;
      try {
        if (action === "play") {
          if (typeof value === "number" && Math.abs(api.getCurrentTime() - value) > 1.5) api.seek(value);
          void api.play();
        } else if (action === "pause") {
          if (typeof value === "number") api.seek(value);
          api.pause();
        } else if (action === "seek" && typeof value === "number") api.seek(value);
      } finally {
        setTimeout(() => { suppressEcho = false; }, 700);
      }
    },

    destroy() {
      destroyed = true;
      ro.disconnect();
      window.removeEventListener("scroll", onLayout, true);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("orientationchange", onLayout);
      clearInterval(poll);
      void handle?.remove().catch(() => {});
      void Native.close().catch(() => {});
    },
  };

  function handleEvent(e: RoomEvent) {
    if (destroyed) return;
    const t = (e.timeMs ?? 0) / 1000;
    switch (e.event) {
      case "time":
        time = t; duration = (e.durationMs ?? 0) / 1000; playing = !!e.playing; lastUpdate = Date.now();
        state("time", { time, duration });
        emit("timeupdate", { time });
        break;
      case "play": time = t; lastUpdate = Date.now(); playing = true; state("play"); emit("play", { time }); break;
      case "pause": time = t; lastUpdate = Date.now(); playing = false; state("pause"); emit("pause", { time }); break;
      case "seeking": time = t; lastUpdate = Date.now(); emit("seeking", { time }); break;
      case "waiting": state("waiting"); emit("waiting"); break;
      case "playing": state("playing"); emit("playing"); break;
      case "ended": playing = false; state("pause"); emit("ended"); break;
      case "ready": { const p = pending; pending = null; p?.resolve(); break; }
      case "resumed": state("resumed"); break;
      case "tracks":
        levels = e.levels ?? []; subs = e.subs ?? []; qNow = e.quality ?? -1; sNow = e.sub ?? -1;
        state("tracks");
        break;
      case "error": {
        const err = new Error(e.message || "Falha ao reproduzir o vídeo.");
        if (pending) {                                    // quebrou ao carregar: tenta a API reserva
          const p = pending; pending = null;
          if (!onFallback && lastArgs) api.load(lastArgs, { fallbackOnly: true }).then(p.resolve, p.reject);
          else p.reject(err);
        } else if (!onFallback && lastArgs) {              // quebrou durante a reprodução: recarrega pela reserva e volta ao mesmo ponto
          const at = time;
          api.load(lastArgs, { fallbackOnly: true }).then(() => { if (at > 3) void Native.seekTo({ ms: Math.round(at * 1000) }); }).catch(() => emit("error", err));
        } else emit("error", err);
        break;
      }
    }
  }
  return api;
}
