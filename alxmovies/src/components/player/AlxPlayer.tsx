import { useCallback, useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import { fetchStream, type StreamRequest, type StreamResult } from "@/services/stream";
import { enterFullscreenLandscape, loadPlayerPrefs, savePlayerPrefs, type EpRef } from "@/lib/media";
import { useBackClose } from "@/hooks/useBackClose";
import { useImmersiveLandscape } from "@/hooks/useImmersiveLandscape";
import { useWakeLock } from "@/hooks/useWakeLock";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface ProgressInfo {
  time: number;
  percent: number;
  ended: boolean;
  hasNext: boolean;
  request: StreamRequest;
}

interface Props {
  title: string;
  subtitle?: string;
  poster?: string;
  request: StreamRequest;
  resumeAt?: number;
  resumePercent?: number;
  getNextEpisode?: (season: number, episode: number) => Promise<EpRef | null>;
  onProgress: (info: ProgressInfo) => void;
  onNext: (next: EpRef) => void;
  onClose: () => void;
  onPlay?: () => void;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(sec).padStart(2, "0")}`;
};

type Phase = "loading" | "slow" | "ready" | "error";
type Menu = null | "quality" | "speed" | "server" | "subs";

export function AlxPlayer(props: Props) {
  const { request, title, subtitle, poster } = props;
  const propsRef = useRef(props);
  propsRef.current = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const prefs = useRef(loadPlayerPrefs());
  const hideTimer = useRef<number>();

  const reqKey = `${request.type}-${request.id}-${request.season ?? 0}-${request.episode ?? 0}`;
  const loadedKey = useRef("");
  const lastTime = useRef(0);
  const pendingAt = useRef<number | null>(null);
  const pendingPct = useRef<number | null>(null);
  const tried = useRef<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [buffering, setBuffering] = useState(false);
  const [stream, setStream] = useState<StreamResult | null>(null);
  const [forced, setForced] = useState<{ key: string; label: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const forcedServer = forced?.key === reqKey ? forced.label : undefined;

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(prefs.current.volume ?? 1);
  const [muted, setMuted] = useState(prefs.current.muted ?? false);
  const [rate, setRate] = useState(prefs.current.rate ?? 1);
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [level, setLevel] = useState(-1);
  const [subs, setSubs] = useState<{ index: number; label: string }[]>([]);
  const [sub, setSub] = useState(-1);
  const [menu, setMenu] = useState<Menu>(null);
  // App Android: paisagem + barras escondidas + tela acesa; botão voltar fecha o menu e depois o player
  useImmersiveLandscape(true);
  useWakeLock(playing);
  useBackClose(true, () => propsRef.current.onClose());
  useBackClose(menu !== null, () => setMenu(null));
  const [controls, setControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [nextEp, setNextEp] = useState<EpRef | null>(null);
  const nextRef = useRef<EpRef | null>(null);
  nextRef.current = nextEp;

  // ---------- progresso ----------
  const report = useCallback((ended = false) => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration) || !v.duration) return;
    propsRef.current.onProgress({
      time: v.currentTime,
      percent: ended ? 100 : (v.currentTime / v.duration) * 100,
      ended,
      hasNext: !!nextRef.current,
      request: propsRef.current.request,
    });
  }, []);

  // Declarado ANTES do efeito de carga: no desmonte o cleanup roda primeiro
  useEffect(() => () => report(), [report]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => report(), 15000);
    return () => clearInterval(t);
  }, [playing, report]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") report(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide as () => void);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide as () => void);
    };
  }, [report]);

  // ---------- carga do vídeo ----------
  useEffect(() => {
    const video = videoRef.current!;
    let cancelled = false;
    let hls: HlsType | null = null;

    const sameMedia = loadedKey.current === reqKey;
    loadedKey.current = reqKey;
    if (!sameMedia) { lastTime.current = 0; tried.current.clear(); }
    pendingAt.current = sameMedia && lastTime.current > 5 ? lastTime.current : propsRef.current.resumeAt ?? null;
    pendingPct.current = sameMedia ? null : propsRef.current.resumePercent ?? null;

    setPhase("loading"); setError(""); setLevels([]); setLevel(-1); setSubs([]); setSub(-1); setNextEp(null);

    const fail = (msg: string) => { if (!cancelled) { setError(msg); setPhase("error"); } };

    (async () => {
      try {
        const s = await fetchStream({
          ...request,
          server: forcedServer,
          onSlow: () => !cancelled && setPhase((p) => (p === "loading" ? "slow" : p)),
        });
        if (cancelled) return;
        setStream(s);
        tried.current.add(s.server);

        if (s.nextEpisode) setNextEp(s.nextEpisode);
        else if (request.type === "tv" && propsRef.current.getNextEpisode) {
          propsRef.current.getNextEpisode(request.season!, request.episode!)
            .then((n) => !cancelled && setNextEp(n))
            .catch(() => {});
        }

        const { default: Hls } = await import("hls.js");
        if (cancelled) return;

        if (Hls.isSupported()) {
          hls = new Hls({ maxBufferLength: 30, enableWorker: true });
          hlsRef.current = hls;
          let netRetries = 0, mediaRecovered = false;

          hls.on(Hls.Events.MANIFEST_PARSED, (_e, d) => {
            setLevels(d.levels.map((l, i) => ({ index: i, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k` })).reverse());
            setPhase("ready");
            void video.play().catch(() => {});
          });
          hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () =>
            setSubs(hls!.subtitleTracks.map((t, i) => ({ index: i, label: t.name || t.lang || `Legenda ${i + 1}` })))
          );
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries++ < 2) { hls!.startLoad(); return; }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls!.recoverMediaError(); return; }
            const other = s.servers.find((x) => x.ok && !tried.current.has(x.label));
            if (other) setForced({ key: reqKey, label: other.label });
            else fail("Não foi possível reproduzir este vídeo. Tente outro servidor ou tente novamente.");
          });
          hls.loadSource(s.m3u8);
          hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = s.m3u8;
          setPhase("ready");
          void video.play().catch(() => {});
        } else {
          fail("Seu navegador não suporta este tipo de vídeo.");
        }
      } catch (e) {
        fail(e instanceof Error ? e.message : "Erro ao carregar o vídeo.");
      }
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, forcedServer, attempt]);

  // ---------- preferências ----------
  useEffect(() => {
    const v = videoRef.current!;
    v.volume = volume; v.muted = muted; v.playbackRate = rate;
    savePlayerPrefs({ volume, muted, rate });
  }, [volume, muted, rate, phase]);

  // ---------- controles ----------
  const togglePlay = useCallback(() => {
    const v = videoRef.current!;
    if (v.paused) void v.play().catch(() => {}); else v.pause();
  }, []);
  const seekBy = (d: number) => {
    const v = videoRef.current!;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
  };
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current!;
    if (document.fullscreenElement) void document.exitFullscreen();
    else enterFullscreenLandscape(el);
  }, []);
  const goNext = useCallback(() => {
    if (nextRef.current) { report(); propsRef.current.onNext(nextRef.current); }
  }, [report]);

  const poke = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) { setControls(false); setMenu(null); }
    }, 3000);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" && (e.target as HTMLInputElement).type === "text") return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
      else if (k === "arrowright") seekBy(10);
      else if (k === "arrowleft") seekBy(-10);
      else if (k === "arrowup") { e.preventDefault(); setVolume((v) => Math.min(1, v + 0.1)); setMuted(false); }
      else if (k === "arrowdown") { e.preventDefault(); setVolume((v) => Math.max(0, v - 0.1)); }
      else if (k === "m") setMuted((m) => !m);
      else if (k === "f") toggleFullscreen();
      else if (k === "n") goNext();
      else return;
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleFullscreen, goNext, poke]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const pickLevel = (i: number) => { if (hlsRef.current) hlsRef.current.currentLevel = i; setLevel(i); setMenu(null); };
  const pickSub = (i: number) => { if (hlsRef.current) hlsRef.current.subtitleTrack = i; setSub(i); setMenu(null); };
  const pickServer = (label: string) => { setForced({ key: reqKey, label }); setMenu(null); };
  const retry = () => { setForced(null); tried.current.clear(); setAttempt((a) => a + 1); };

  const showUi = controls || !playing || menu !== null;
  const busy = phase === "loading" || phase === "slow" || (phase === "ready" && buffering);

  return (
    <div ref={containerRef} className={`axp ${showUi ? "axp-ui" : ""}`} onMouseMove={poke} onTouchStart={poke}>
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        onClick={() => { togglePlay(); poke(); }}
        onPlay={() => { setPlaying(true); propsRef.current.onPlay?.(); }}
        onPause={() => { setPlaying(false); setControls(true); report(); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onTimeUpdate={(e) => { lastTime.current = e.currentTarget.currentTime; setTime(e.currentTarget.currentTime); }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (pendingAt.current != null) v.currentTime = pendingAt.current;
          else if (pendingPct.current != null && isFinite(v.duration)) v.currentTime = (v.duration * pendingPct.current) / 100;
          pendingAt.current = null; pendingPct.current = null;
        }}
        onEnded={() => { report(true); if (nextRef.current) propsRef.current.onNext(nextRef.current); }}
      />

      {busy && (
        <div className="axp-center">
          <div className="axp-spinner" />
          {phase === "slow" && <p>Acordando o servidor de vídeo… pode levar até um minuto.</p>}
        </div>
      )}
      {phase === "error" && (
        <div className="axp-center axp-error">
          <p>{error}</p>
          <button onClick={retry}>Tentar novamente</button>
        </div>
      )}

      <div className="axp-top">
        <button aria-label="Voltar" onClick={props.onClose}>←</button>
        <div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
      </div>

      <div className="axp-bottom">
        <input
          className="axp-seek" type="range" min={0} max={duration || 0} step={1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => { videoRef.current!.currentTime = Number(e.target.value); }}
          aria-label="Progresso"
        />
        <div className="axp-row">
          <button onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproduzir"}>{playing ? "❚❚" : "▶"}</button>
          <button onClick={() => seekBy(-10)} aria-label="Voltar 10s">↺10</button>
          <button onClick={() => seekBy(10)} aria-label="Avançar 10s">10↻</button>
          <button onClick={() => setMuted((m) => !m)} aria-label="Som">{muted || volume === 0 ? "🔇" : "🔊"}</button>
          <input className="axp-vol" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} aria-label="Volume" />
          <span className="axp-time">{fmt(time)} / {fmt(duration)}</span>
          <span className="axp-spacer" />
          {nextEp && <button onClick={goNext}>Próximo ⏭</button>}
          {subs.length > 0 && <button onClick={() => setMenu(menu === "subs" ? null : "subs")}>CC</button>}
          {levels.length > 0 && <button onClick={() => setMenu(menu === "quality" ? null : "quality")}>⚙ {level === -1 ? "Auto" : levels.find((l) => l.index === level)?.label}</button>}
          <button onClick={() => setMenu(menu === "speed" ? null : "speed")}>{rate}x</button>
          {stream && stream.servers.length > 1 && <button onClick={() => setMenu(menu === "server" ? null : "server")}>Servidor</button>}
          <button className="axp-fs-btn" onClick={toggleFullscreen} aria-label="Tela cheia">{fullscreen ? "⤡" : "⤢"}</button>
        </div>

        {menu && (
          <div className="axp-menu">
            {menu === "quality" && <>
              <button className={level === -1 ? "on" : ""} onClick={() => pickLevel(-1)}>Automático</button>
              {levels.map((l) => <button key={l.index} className={level === l.index ? "on" : ""} onClick={() => pickLevel(l.index)}>{l.label}</button>)}
            </>}
            {menu === "speed" && RATES.map((r) => <button key={r} className={rate === r ? "on" : ""} onClick={() => { setRate(r); setMenu(null); }}>{r}x</button>)}
            {menu === "subs" && <>
              <button className={sub === -1 ? "on" : ""} onClick={() => pickSub(-1)}>Desativadas</button>
              {subs.map((s) => <button key={s.index} className={sub === s.index ? "on" : ""} onClick={() => pickSub(s.index)}>{s.label}</button>)}
            </>}
            {menu === "server" && stream?.servers.map((s) => (
              <button key={s.label} disabled={!s.ok} className={stream.server === s.label ? "on" : ""} onClick={() => pickServer(s.label)}>
                {s.label}{!s.ok && " (indisponível)"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
