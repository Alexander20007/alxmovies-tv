import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useDebounce } from "@/hooks/useDebounce";
import { createRoomPlayer, type RoomPlayer } from "@/lib/roomPlayer";
import {
  addToQueue, advanceEpisode, claimHostIfAbandoned, closeRoom, joinRoom, loadQueue, loadRecentMessages, playFromQueue,
  removeFromQueue, sendMessage, subscribeToRoom, transferHost, updateRoomState,
  type PresenceUser, type QueueItem, type RoomChannel, type RoomMessage, type RoomRow,
} from "@/services/rooms";
import { posterUrl, tmdb } from "@/services/tmdb";
import { useQuery } from "@tanstack/react-query";
import { copyText, isNative } from "@/lib/native";
import { useBackClose } from "@/hooks/useBackClose";
import { useImmersiveLandscape } from "@/hooks/useImmersiveLandscape";
import { useWakeLock } from "@/hooks/useWakeLock";

const HEARTBEAT_MS = 10000;
const CHAT_POLL_MS = 4000;
const EMOJIS = ["😱", "👍", "🔥", "😂", "❤️"];

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "00:00";
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const avatarColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 42%)`;
};

interface ChatMsg { key: string; system?: boolean; mine?: boolean; name?: string; text: string }
type Menu = null | "quality" | "subs";

function QueueAdd({ onPick }: { onPick: (item: { id: number; media_type: "movie" | "tv"; title: string; poster_path: string | null }) => void }) {
  const [term, setTerm] = useState("");
  const q = useDebounce(term.trim());
  const res = useQuery({ queryKey: ["queue-search", q], queryFn: () => tmdb.search(q, "multi"), enabled: q.length >= 2 });
  const items = (res.data?.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 6);
  return (
    <div className="salas-busca-resultados" style={{ display: "flex", flexDirection: "column" }}>
      <input className="sala-fila-input-busca" type="text" placeholder="Buscar filme ou série..." autoFocus value={term} onChange={(e) => setTerm(e.target.value)} />
      {items.map((r) => (
        <div key={r.id} className="salas-busca-item"
          onClick={() => onPick({ id: r.id, media_type: r.media_type as "movie" | "tv", title: r.title ?? r.name ?? "", poster_path: r.poster_path })}>
          <img src={r.poster_path ? posterUrl(r.poster_path, "w200") : "/assets/no-poster.png"} alt="" />
          <span>{r.title ?? r.name} {r.media_type === "tv" ? "(série)" : ""}</span>
        </div>
      ))}
    </div>
  );
}

interface SessionProps { initial: RoomRow; userId: string; displayName: string; avatar: string | null }

function RoomSession({ initial, userId, displayName, avatar }: SessionProps) {
  const navigate = useNavigate();
  const isHost = initial.host_user_id === userId;

  const roomRef = useRef<RoomRow>({ ...initial });
  const [room, setRoomView] = useState<RoomRow>(initial);
  const refreshRoom = () => setRoomView({ ...roomRef.current });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<RoomPlayer | null>(null);
  const channelRef = useRef<RoomChannel | null>(null);
  const seasonCounts = useRef<Map<number, number> | null>(null);
  const cur = useRef({ season: initial.season, episode: initial.episode });
  const lastState = useRef({ isPlaying: initial.is_playing, position: initial.position_seconds });
  const online = useRef(new Map<string, string>());
  const seen = useRef(new Set<string>());
  const counter = useRef(0);
  const dragging = useRef(false);

  const [badge, setBadge] = useState({ text: "● conectando", offline: false });
  const [banner, setBanner] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string | null>("Carregando vídeo...");
  const [syncInfo, setSyncInfo] = useState("");
  const [overlay, setOverlay] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ season: number; episode: number } | null>(null);
  const [participants, setParticipants] = useState<PresenceUser[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [floating, setFloating] = useState<{ key: string; name: string; text: string }[]>([]);
  const [reactions, setReactions] = useState<{ key: string; emoji: string; left: number }[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [levels, setLevels] = useState<{ index: number; height: number; bitrate: number }[]>([]);
  const [subs, setSubs] = useState<{ index: number; label: string }[]>([]);
  const [qualityNow, setQualityNow] = useState(-1);
  const [subNow, setSubNow] = useState(-1);
  const [menu, setMenu] = useState<Menu>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [nativeFs, setNativeFs] = useState(false);
  useImmersiveLandscape(nativeFs);
  useWakeLock(true);
  useBackClose(nativeFs, () => setNativeFs(false));
  useBackClose(menu !== null, () => setMenu(null));
  const [volume, setVolume] = useState(100);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");

  const key = () => `k${++counter.current}`;
  const flashBadge = (text: string) => {
    setBadge((b) => ({ ...b, text }));
    setTimeout(() => setBadge((b) => ({ ...b, text: "● Sincronizado" })), 1800);
  };
  const addSystem = (text: string) => setMessages((m) => [...m, { key: key(), system: true, text }]);
  const addChat = (row: RoomMessage) => {
    if (seen.current.has(row.id)) return;
    seen.current.add(row.id);
    setMessages((m) => [...m, { key: row.id, mine: row.user_id === userId, name: row.display_name, text: row.message }]);
    const k = key();
    setFloating((f) => [...f.slice(-3), { key: k, name: row.display_name, text: row.message }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.key !== k)), 4700);
  };
  const showReaction = (emoji: string) => {
    const k = key();
    setReactions((r) => [...r, { key: k, emoji, left: 10 + Math.random() * 75 }]);
    setTimeout(() => setReactions((r) => r.filter((x) => x.key !== k)), 2300);
  };

  const refreshMenus = () => {
    const p = playerRef.current;
    if (!p) return;
    setLevels(p.getQualityLevels());
    setQualityNow(p.getCurrentQualityLevel());
    setTimeout(() => { setSubs(p.getSubtitleTracks()); setSubNow(p.getCurrentSubtitleTrack()); }, 1200);
  };

  /** Carrega (ou recarrega) o vídeo da sala com o estado atual de roomRef/cur. */
  async function loadVideo(status: string) {
    const p = playerRef.current!;
    const r = roomRef.current;
    setVideoStatus(status);
    try {
      await p.load({ tmdbId: r.tmdb_id, mediaType: r.media_type, season: cur.current.season, episode: cur.current.episode });
      setVideoStatus(null);
      refreshMenus();
      return true;
    } catch (e) {
      setVideoStatus(e instanceof Error ? e.message : "Não foi possível carregar o vídeo.");
      return false;
    }
  }

  async function loadSeasonCounts() {
    const r = roomRef.current;
    if (r.media_type !== "tv") { seasonCounts.current = null; return; }
    try {
      const info: any = await tmdb.details("tv", r.tmdb_id);
      seasonCounts.current = new Map((info.seasons ?? []).filter((s: any) => s.season_number >= 1).map((s: any) => [s.season_number, s.episode_count]));
    } catch { seasonCounts.current = new Map(); }
  }

  async function trocarEpisodio(season: number, episode: number, autoplay: boolean) {
    cur.current = { season, episode };
    roomRef.current.season = season; roomRef.current.episode = episode;
    if (!(await loadVideo("Carregando próximo episódio..."))) return;
    refreshRoom();
    if (autoplay) (isHost ? playerRef.current!.play() : playerRef.current!.applyRemote("play", 0));
  }

  async function trocarConteudo(c: RoomRow, autoplay: boolean) {
    Object.assign(roomRef.current, {
      tmdb_id: c.tmdb_id, media_type: c.media_type, season: c.season, episode: c.episode,
      movie_title: c.movie_title, poster_path: c.poster_path, season_limit: c.season_limit,
    });
    cur.current = { season: c.season, episode: c.episode };
    await loadSeasonCounts();
    if (!(await loadVideo("Carregando o próximo da fila..."))) return;
    refreshRoom();
    if (autoplay) (isHost ? playerRef.current!.play() : playerRef.current!.applyRemote("play", 0));
  }

  async function avancar(season: number, episode: number) {
    try { await advanceEpisode(roomRef.current.id, season, episode); }
    catch (e) { addSystem(e instanceof Error ? e.message : "Não foi possível avançar o episódio."); return; }
    channelRef.current?.broadcastControl("episode-change", 0, { season, episode });
    await trocarEpisodio(season, episode, true);
  }

  function nextEpisode(season: number, episode: number) {
    const counts = seasonCounts.current;
    const n = counts?.get(season);
    if (n && episode < n) return { season, episode: episode + 1 };
    if (counts?.has(season + 1)) return { season: season + 1, episode: 1 };
    return null;
  }

  function onEpisodeEnded() {
    const r = roomRef.current;
    if (r.media_type !== "tv" || cur.current.season == null || cur.current.episode == null) return;
    const next = nextEpisode(cur.current.season, cur.current.episode);
    if (!next) return addSystem("A maratona chegou ao fim (não há próximo episódio disponível).");
    if (r.season_limit) {
      if (next.season <= r.season_limit) void avancar(next.season, next.episode);
      else addSystem(`A maratona configurada vai até a temporada ${r.season_limit} e terminou aqui.`);
    } else setPrompt(next);
  }

  async function forcePortrait() {
    if (isNative) return; // no app a tela cheia é controlada pelo botão ⛶
    try {
      await document.documentElement.requestFullscreen?.().catch(() => {});
      if ((screen.orientation as any)?.lock) { await (screen.orientation as any).lock("landscape"); return; }
      throw new Error("sem suporte");
    } catch { document.body.classList.add("sala-forcar-paisagem-css"); }
  }

  // ---------- sessão em tempo real ----------
  useEffect(() => {
    const player = createRoomPlayer(videoRef.current!);
    playerRef.current = player;
    const intervals: number[] = [];
    let disposed = false;
    let lastHeartbeat = Date.now();
    let channelDown = false;
    let hostAbsentSince: number | null = null;
    let triedClaim = false;
    let firstPresence = true;
    let prevNames = new Map<string, string>();

    const avisarSeDessincronizado = (hostTime: number) => {
      const diff = Math.abs(videoRef.current!.currentTime - hostTime);
      if (diff < 3) return;
      setSyncInfo(`🔄 Ajustando sincronia (estava ${diff.toFixed(0)}s de diferença)`);
      setTimeout(() => setSyncInfo(""), 2500);
    };

    async function tryClaimHost() {
      try {
        const novo = await claimHostIfAbandoned(roomRef.current.id, [...online.current.keys()]);
        if (!novo) return;
        channelRef.current?.broadcastControl("host-changed", 0, { newHostUserId: novo.host_user_id, newHostName: novo.host_name });
        addSystem(`O anfitrião ficou ausente. ${novo.host_name} assumiu automaticamente a sala.`);
        setTimeout(() => window.location.reload(), 1200);
      } catch { triedClaim = false; }
    }

    const channel = subscribeToRoom(roomRef.current.id, userId, displayName, {
      onControl: (p) => {
        if (p.action === "episode-change") { if (!isHost) void trocarEpisodio(p.season, p.episode, true); return; }
        if (p.action === "reaction") return showReaction(p.emoji);
        if (p.action === "host-changed") { addSystem(`${p.newHostName} agora é o anfitrião da sala.`); setTimeout(() => window.location.reload(), 1200); return; }
        if (p.action === "queue-play") { if (!isHost) void trocarConteudo(p.content, true); return; }
        if (p.action === "room-closed") {
          player.pause();
          setBadge({ text: "Sala encerrada pelo anfitrião", offline: true });
          addSystem("O anfitrião encerrou a sala. Redirecionando...");
          setTimeout(() => navigate("/salas"), 2500);
          return;
        }
        if (isHost) return;
        if (p.action === "play" || p.action === "seek") avisarSeDessincronizado(p.time);
        lastHeartbeat = Date.now();
        if (p.action === "play") lastState.current = { isPlaying: true, position: p.time };
        if (p.action === "pause") lastState.current = { isPlaying: false, position: p.time };
        player.applyRemote(p.action, p.time);
      },
      onMessage: addChat,
      onPresence: (list) => {
        const before = new Set(online.current.keys());
        online.current = new Map(list.map((p) => [p.user_id, p.display_name] as [string, string]));
        if (!firstPresence) {
          online.current.forEach((name, id) => { if (!before.has(id)) addSystem(`${name} entrou na sala`); });
          before.forEach((id) => { if (!online.current.has(id)) addSystem(`${prevNames.get(id) || "Alguém"} saiu da sala`); });
        }
        firstPresence = false;
        prevNames = new Map(online.current);
        setParticipants(list);
        if (!isHost) {
          if (list.some((p) => p.user_id === roomRef.current.host_user_id)) { hostAbsentSince = null; triedClaim = false; }
          else if (hostAbsentSince === null) hostAbsentSince = Date.now();
        }
      },
      onQueueAdd: (row) => setQueue((q) => (q.some((x) => x.id === row.id) ? q : [...q, row])),
      onQueueRemove: (row) => setQueue((q) => q.filter((x) => x.id !== row.id)),
      onConnectionChange: (status) => {
        channelDown = status !== "SUBSCRIBED";
        if (channelDown) setBanner("🔌 Reconectando...");
        else if (Date.now() - lastHeartbeat <= HEARTBEAT_MS * 2.5) setBanner(null);
      },
    }, avatar);
    channelRef.current = channel;
    setBadge({ text: "● Sincronizado", offline: false });

    if (isHost) {
      const rid = roomRef.current.id;
      player.on("play", ({ time }) => { channel.broadcastControl("play", time); updateRoomState(rid, true, time).catch(() => {}); });
      player.on("pause", ({ time }) => { channel.broadcastControl("pause", time); updateRoomState(rid, false, time).catch(() => {}); });
      player.on("seeking", ({ time }) => { channel.broadcastControl("seek", time); updateRoomState(rid, player.isPlaying(), time).catch(() => {}); });
      player.on("ended", onEpisodeEnded);
      intervals.push(window.setInterval(() => {
        if (!player.isPlaying()) return;
        const t = player.getCurrentTime();
        channel.broadcastControl("seek", t);
        updateRoomState(rid, true, t).catch(() => {});
      }, HEARTBEAT_MS));
    } else {
      intervals.push(window.setInterval(() => {
        if (channelDown) return;
        setBanner(Date.now() - lastHeartbeat > HEARTBEAT_MS * 2.5 ? "⏳ Aguardando o anfitrião reconectar..." : null);
      }, 5000));
      intervals.push(window.setInterval(() => {
        if (hostAbsentSince && Date.now() - hostAbsentSince >= 10000 && !triedClaim) { triedClaim = true; void tryClaimHost(); }
      }, 3000));
    }

    const onUnload = () => channel.unsubscribe();
    window.addEventListener("beforeunload", onUnload);

    (async () => {
      const [q, msgs] = await Promise.all([loadQueue(roomRef.current.id).catch(() => []), loadRecentMessages(roomRef.current.id).catch(() => [])]);
      if (disposed) return;
      setQueue(q);
      msgs.forEach(addChat);
      intervals.push(window.setInterval(async () => {
        const fresh = await loadRecentMessages(roomRef.current.id).catch(() => []);
        fresh.forEach((m) => { if (!seen.current.has(m.id)) addChat(m); });
      }, CHAT_POLL_MS));

      await loadSeasonCounts();
      if (disposed) return;
      if (await loadVideo("Carregando vídeo...")) {
        setOverlay(isHost ? "Toque para começar a exibir" : "Toque para assistir");
      }
    })();

    return () => {
      disposed = true;
      intervals.forEach(clearInterval);
      window.removeEventListener("beforeunload", onUnload);
      channel.unsubscribe();
      player.destroy();
      document.body.classList.remove("sala-forcar-paisagem-css");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume / 100; }, [volume]);

  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end" }); }, [messages]);

  // ---------- ações ----------
  const player = () => playerRef.current!;
  const channel = () => channelRef.current!;

  async function startFromOverlay() {
    setOverlay(null);
    await forcePortrait();
    if (isHost) void player().play();
    else player().applyRemote(lastState.current.isPlaying ? "play" : "pause", lastState.current.position);
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput(""); setChatError("");
    try { addChat(await sendMessage(roomRef.current.id, userId, displayName, text)); }
    catch (err) { setChatError("Não foi possível enviar (" + (err instanceof Error ? err.message : "erro desconhecido") + ")"); }
  }

  async function playQueueItem(item: QueueItem) {
    try {
      const content = await playFromQueue(item.id);
      channel().broadcastControl("queue-play", 0, { content });
      await trocarConteudo(content, true);
    } catch (e) { addSystem(e instanceof Error ? e.message : "Não foi possível tocar esse item."); }
  }

  async function makeHost(id: string, name: string) {
    if (!window.confirm(`Tornar ${name} o anfitrião? Você deixa de controlar a sala.`)) return;
    try {
      await transferHost(roomRef.current.id, id);
      channel().broadcastControl("host-changed", 0, { newHostUserId: id, newHostName: name });
    } catch (e) { return addSystem(e instanceof Error ? e.message : "Não foi possível transferir o controle."); }
    window.location.reload();
  }

  async function endRoom() {
    if (!window.confirm("Encerrar a sala pra todo mundo? Não dá pra desfazer.")) return;
    channel().broadcastControl("room-closed", 0);
    try { await closeRoom(roomRef.current.id); } catch { /* segue */ }
    navigate("/salas");
  }

  const title = room.media_type === "tv"
    ? `${room.title} — ${room.movie_title} (T${room.season}:E${room.episode})`
    : `${room.title} — ${room.movie_title}`;
  const hostId = room.host_user_id;

  return (
    <div className="sala-page" id="sala-page">
      <div className="sala-app-header">
        <Link to="/salas" className="sala-voltar" title="Voltar">←</Link>
        <div className="sala-room-meta">
          <h1>{title}</h1>
          <div className="sala-room-status">
            <span className={`sala-status-badge${badge.offline ? " offline" : ""}`}>{badge.text}</span>
            <span className="sala-online-count">{participants.length ? `online • ${participants.length} assistindo` : ""}</span>
          </div>
        </div>
        <button type="button" className="sala-invite-btn"
          onClick={() => void copyText(window.location.href).then((ok) => flashBadge(ok ? "Link copiado!" : "Não foi possível copiar o link."))}>
          🔗 Copiar link da sala
        </button>
      </div>

      <div className="sala-corpo">
        <div className="sala-video-col">
          <div className={`sala-video-wrapper${nativeFs ? " sala-native-fs" : ""}`} ref={wrapperRef}>
            <video ref={videoRef} playsInline crossOrigin="anonymous"
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); setDuration(e.currentTarget.duration); }} />
            {videoStatus && <div className="sala-status" style={{ display: "flex" }}>{videoStatus}</div>}
            {banner && <div className="sala-conexao-banner" style={{ display: "block" }}>{banner}</div>}

            <div className="sala-chat-overlay">
              {floating.map((f) => <div key={f.key} className="sala-chat-overlay-msg"><strong>{f.name}</strong>{f.text}</div>)}
            </div>
            <div className="sala-reacoes-overlay">
              {reactions.map((r) => <span key={r.key} className="sala-reacao-emoji" style={{ left: `${r.left}%` }}>{r.emoji}</span>)}
            </div>

            {overlay && (
              <div className="sala-play-overlay" style={{ display: "flex" }}>
                <button type="button" className="sala-play-overlay-btn" onClick={() => void startFromOverlay()}>▶</button>
                <span>{overlay}</span>
              </div>
            )}

            <div className="sala-player-bar">
              <input type="range" className="sala-progress" min={0} max={1000} step={1} disabled={!isHost}
                value={duration > 0 && isFinite(duration) ? (time / duration) * 1000 : 0}
                onChange={(e) => { dragging.current = true; setTime((Number(e.target.value) / 1000) * (duration || 0)); }}
                onMouseUp={(e) => { if (isHost && duration > 0) player().seek((Number(e.currentTarget.value) / 1000) * duration); dragging.current = false; }}
                onTouchEnd={(e) => { if (isHost && duration > 0) player().seek((Number(e.currentTarget.value) / 1000) * duration); dragging.current = false; }}
                onKeyUp={(e) => { if (isHost && duration > 0) player().seek((Number(e.currentTarget.value) / 1000) * duration); }} />

              <div className="sala-controls-row">
                {isHost && (
                  <>
                    <button type="button" className="sala-ctrl-btn" style={{ display: "flex" }} onClick={() => (player().isPlaying() ? player().pause() : void player().play())}>{playing ? "⏸" : "▶"}</button>
                    <button type="button" className="sala-ctrl-btn sala-ctrl-btn-small" style={{ display: "flex" }} title="Voltar 10s" onClick={() => player().seek(player().getCurrentTime() - 10)}>⏪</button>
                    <button type="button" className="sala-ctrl-btn sala-ctrl-btn-small" style={{ display: "flex" }} title="Avançar 10s" onClick={() => player().seek(player().getCurrentTime() + 10)}>⏩</button>
                  </>
                )}
                <span className="sala-tempo">{fmt(time)} / {fmt(duration)}</span>
                <span className="sala-ctrl-spacer" />
                <div className="sala-volume-box">
                  <span>🔊</span>
                  <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
                </div>

                {subs.length > 0 && (
                  <div className="sala-qualidade-box">
                    <button type="button" id="sala-btn-legendas" className="sala-ctrl-btn" style={{ display: "flex" }} title="Legendas"
                      onClick={(e) => { e.stopPropagation(); setSubNow(player().getCurrentSubtitleTrack()); setMenu(menu === "subs" ? null : "subs"); }}>CC</button>
                    {menu === "subs" && (
                      <div className="sala-qualidade-menu" style={{ display: "block" }}>
                        <button type="button" className={subNow === -1 ? "ativo" : ""} onClick={() => player().setSubtitleTrack(-1)}>Desligadas</button>
                        {subs.map((s) => <button key={s.index} type="button" className={subNow === s.index ? "ativo" : ""} onClick={() => player().setSubtitleTrack(s.index)}>{s.label}</button>)}
                      </div>
                    )}
                  </div>
                )}

                {levels.length > 1 && (
                  <div className="sala-qualidade-box">
                    <button type="button" className="sala-ctrl-btn" style={{ display: "flex" }} title="Qualidade"
                      onClick={(e) => { e.stopPropagation(); setQualityNow(player().getCurrentQualityLevel()); setMenu(menu === "quality" ? null : "quality"); }}>⚙️</button>
                    {menu === "quality" && (
                      <div className="sala-qualidade-menu" style={{ display: "block" }}>
                        <button type="button" className={qualityNow === -1 ? "ativo" : ""} onClick={() => player().setQualityLevel(-1)}>Automático</button>
                        {[...levels].sort((a, b) => (b.height || 0) - (a.height || 0)).map((l) => (
                          <button key={l.index} type="button" className={qualityNow === l.index ? "ativo" : ""} onClick={() => player().setQualityLevel(l.index)}>
                            {l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}kbps`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button type="button" className="sala-ctrl-btn" title="Tela cheia"
                  onClick={() => (isNative ? setNativeFs((v) => !v) : document.fullscreenElement ? void document.exitFullscreen() : void wrapperRef.current?.requestFullscreen?.())}>⛶</button>
              </div>
              <div className={`sala-sync-info${syncInfo ? " aviso" : ""}`}>{syncInfo}</div>
            </div>
          </div>

          {prompt && (
            <div className="sala-prompt-avancar" style={{ display: "flex" }}>
              <p>Episódio terminou. Avançar para o próximo?</p>
              <button type="button" className="btn-primary" onClick={() => { const p = prompt; setPrompt(null); void avancar(p.season, p.episode); }}>Sim</button>
              <button type="button" onClick={() => setPrompt(null)}>Não</button>
            </div>
          )}

          {isHost && (
            <div className="sala-host-bar" style={{ display: "flex" }}>
              <span className="sala-host-pill">🔴 Controles do anfitrião: ativos</span>
              <button type="button" onClick={() => player().pause()}>⏸ Pausar pra todos</button>
              <button type="button" onClick={() => {
                const t = player().getCurrentTime();
                channel().broadcastControl("seek", t);
                updateRoomState(roomRef.current.id, player().isPlaying(), t).catch(() => {});
                flashBadge("Sincronizado!");
              }}>🔄 Sincronizar agora</button>
              <button type="button" className="sala-btn-perigo" onClick={() => void endRoom()}>🚪 Encerrar sala</button>
            </div>
          )}
        </div>

        <div className="sala-side-col">
          <div className="sala-participantes-box">
            <div className="sala-fila-header">
              <h3>Fila <span className="sala-participantes-count">{queue.length ? `— ${queue.length}` : ""}</span></h3>
              <button type="button" className="sala-fila-add-btn" onClick={() => setQueueOpen((o) => !o)}>+ Adicionar</button>
            </div>
            {queueOpen && (
              <QueueAdd onPick={async (it) => {
                try {
                  await addToQueue(roomRef.current.id, userId, displayName, {
                    tmdbId: it.id, mediaType: it.media_type, season: it.media_type === "tv" ? 1 : null, episode: it.media_type === "tv" ? 1 : null,
                    movieTitle: it.title, posterPath: it.poster_path,
                  });
                } catch (e) { addSystem(e instanceof Error ? e.message : "Não foi possível adicionar à fila."); }
                setQueueOpen(false);
              }} />
            )}
            <div className="sala-fila-lista">
              {!queue.length && <p className="sala-fila-vazia">Fila vazia. Adicione o próximo filme!</p>}
              {queue.map((item) => (
                <div key={item.id} className="sala-fila-item">
                  <img src={item.poster_path ? posterUrl(item.poster_path, "w200") : "/assets/no-poster.png"} alt="" />
                  <div className="sala-fila-item-info">
                    <span className="sala-fila-item-titulo">{item.movie_title}</span>
                    <span className="sala-fila-item-por">adicionado por {item.added_by_name}</span>
                  </div>
                  {isHost && <button type="button" className="tocar" title="Tocar agora" onClick={() => void playQueueItem(item)}>▶</button>}
                  {(isHost || item.added_by_user_id === userId) && (
                    <button type="button" className="remover" title="Remover" onClick={() => removeFromQueue(item.id).catch(() => {})}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="sala-participantes-box">
            <h3>Participantes <span className="sala-participantes-count">{participants.length ? `— ${participants.length} online` : ""}</span></h3>
            <div className="sala-participantes-lista">
              {participants.map((p) => {
                const name = p.display_name || "?";
                const isRoomHost = p.user_id === hostId;
                return (
                  <div key={p.user_id} className={`sala-participante${isRoomHost ? " eh-anfitriao" : ""}`}>
                    {p.avatar_url
                      ? <img className="sala-participante-avatar" src={p.avatar_url} alt="" />
                      : <span className="sala-participante-avatar" style={{ background: avatarColor(name) }}>{(name[0] || "?").toUpperCase()}</span>}
                    <span className="sala-participante-nome">{name}</span>
                    <span className="sala-participante-tag">{isRoomHost ? "Anfitrião" : "Assistindo"}</span>
                    {isHost && !isRoomHost && (
                      <button type="button" className="sala-btn-tornar-anfitriao" title="Tornar anfitrião" onClick={() => void makeHost(p.user_id, name)}>👑</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sala-chat-col">
            <div className="sala-chat-mensagens">
              {messages.map((m) => m.system
                ? <div key={m.key} className="sala-chat-msg sistema"><em>{m.text}</em></div>
                : <div key={m.key} className={`sala-chat-msg${m.mine ? " minha" : ""}`}><strong>{m.name}</strong><span>{m.text}</span></div>)}
              <div ref={chatEnd} />
            </div>
            <div className="sala-reacoes-rapidas">
              {EMOJIS.map((e) => <button key={e} type="button" onClick={() => { showReaction(e); channel().broadcastControl("reaction", 0, { emoji: e }); }}>{e}</button>)}
            </div>
            {chatError && <p className="salas-erro" style={{ display: "block" }}>{chatError}</p>}
            <form className="sala-chat-form" onSubmit={(e) => void onSend(e)}>
              <input type="text" maxLength={500} placeholder="Digite uma mensagem..." autoComplete="off" value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
              <button type="submit">Enviar</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Room() {
  const [params] = useSearchParams();
  const roomId = params.get("id");
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const displayName = activeProfile?.name || user?.email || "Convidado";

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [needPassword, setNeedPassword] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [fatal, setFatal] = useState("");
  const tried = useRef(false);

  const enter = useCallback(async (password: string | null) => {
    try {
      setRoom(await joinRoom(roomId!, password, displayName));
      setNeedPassword(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("senha")) setNeedPassword(msg.includes("incorreta") ? "Senha incorreta." : "");
      else setFatal(msg || "Não foi possível entrar nessa sala.");
    }
  }, [roomId, displayName]);

  useEffect(() => {
    if (!roomId || tried.current) return;
    tried.current = true;
    void enter(null);
  }, [roomId, enter]);

  if (!roomId) return <Navigate to="/salas" replace />;
  if (room) return <RoomSession initial={room} userId={user!.id} displayName={displayName} avatar={activeProfile?.avatar ?? null} />;

  return (
    <div className="sala-page">
      {fatal ? (
        <div className="salas-modal" style={{ display: "flex" }}>
          <div className="salas-modal-box">
            <h2>Sala indisponível</h2>
            <p>{fatal}</p>
            <Link className="btn-primary" to="/salas">Voltar às salas</Link>
          </div>
        </div>
      ) : needPassword !== null ? (
        <div className="salas-modal" style={{ display: "flex" }}>
          <div className="salas-modal-box">
            <h2>Sala privada</h2>
            <p>Digite a senha pra entrar.</p>
            <input type="password" placeholder="Senha" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void enter(pw)} />
            <button type="button" className="btn-primary" onClick={() => void enter(pw)}>Entrar</button>
            <p className="salas-erro">{needPassword}</p>
          </div>
        </div>
      ) : (
        <p style={{ padding: 24, color: "#fff" }}>Entrando na sala…</p>
      )}
    </div>
  );
}
