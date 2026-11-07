import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useDebounce } from "@/hooks/useDebounce";
import { createRoomPlayer, type RoomPlayer } from "@/lib/roomPlayer";
import { createNativeRoomPlayer } from "@/lib/nativeRoomPlayer";
import { Icon } from "@/components/Icon";
import {
  addToQueue, advanceEpisode, claimHostIfAbandoned, closeRoom, joinRoom, loadQueue, loadRecentMessages, playFromQueue,
  removeFromQueue, sendMessage, subscribeToRoom, transferHost, updateRoomState,
  type PresenceUser, type QueueItem, type RoomChannel, type RoomMessage, type RoomRow,
} from "@/services/rooms";
import { posterUrl, tmdb } from "@/services/tmdb";
import { useQuery } from "@tanstack/react-query";
import { isNative, shareLink } from "@/lib/native";
import { IconLock } from "@/components/RoomIcons";
import { useBackClose } from "@/hooks/useBackClose";
import { useImmersiveLandscape } from "@/hooks/useImmersiveLandscape";
import { useWakeLock } from "@/hooks/useWakeLock";
import { StaffName } from "@/components/VerifiedName";

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

interface ChatMsg { key: string; system?: boolean; mine?: boolean; name?: string; uid?: string; text: string }
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
  const stageRef = useRef<HTMLDivElement>(null);
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
  const [floating, setFloating] = useState<{ key: string; name: string; uid?: string; text: string }[]>([]);
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
  const [tab, setTab] = useState<"chat" | "fila" | "pessoas">("chat");
  const [shareMsg, setShareMsg] = useState("");
  const [uiOn, setUiOn] = useState(true);
  const [uiTick, setUiTick] = useState(0);
  const bumpUi = () => { setUiOn(true); setUiTick((n) => n + 1); };

  const key = () => `k${++counter.current}`;
  const flashBadge = (text: string) => {
    setBadge((b) => ({ ...b, text }));
    setTimeout(() => setBadge((b) => ({ ...b, text: "● Sincronizado" })), 1800);
  };
  const addSystem = (text: string) => setMessages((m) => [...m, { key: key(), system: true, text }]);
  const addChat = (row: RoomMessage) => {
    if (seen.current.has(row.id)) return;
    seen.current.add(row.id);
    setMessages((m) => [...m, { key: row.id, mine: row.user_id === userId, name: row.display_name, uid: row.user_id, text: row.message }]);
    const k = key();
    setFloating((f) => [...f.slice(-3), { key: k, name: row.display_name, uid: row.user_id, text: row.message }]);
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
    // no app: ExoPlayer nativo atrás da página; na web: <video> + hls.js
    const player: RoomPlayer = isNative ? createNativeRoomPlayer(stageRef.current!) : createRoomPlayer(videoRef.current!);
    playerRef.current = player;
    player.on("state:play", () => setPlaying(true));
    player.on("state:pause", () => setPlaying(false));
    player.on("state:time", (p: { time: number; duration: number }) => { if (!dragging.current) setTime(p.time); setDuration(p.duration); });
    player.on("state:tracks", () => {
      setLevels(player.getQualityLevels()); setQualityNow(player.getCurrentQualityLevel());
      setSubs(player.getSubtitleTracks()); setSubNow(player.getCurrentSubtitleTrack());
    });
    // voltou do segundo plano: o anfitrião continua pausado; quem assiste volta ao estado da sala
    player.on("state:resumed", () => { if (!isHost) player.applyRemote(lastState.current.isPlaying ? "play" : "pause", lastState.current.position); });
    const intervals: number[] = [];
    let disposed = false;
    let lastHeartbeat = Date.now();
    let channelDown = false;
    let hostAbsentSince: number | null = null;
    let triedClaim = false;
    let firstPresence = true;
    let prevNames = new Map<string, string>();

    const avisarSeDessincronizado = (hostTime: number) => {
      const diff = Math.abs(player.getCurrentTime() - hostTime);
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

  useEffect(() => { playerRef.current?.setVolume(volume); }, [volume]);

  // com o player nativo a página precisa ficar transparente na área do vídeo (ele é desenhado por trás do WebView)
  useEffect(() => {
    if (!isNative) return;
    document.documentElement.classList.add("room-native");
    return () => document.documentElement.classList.remove("room-native");
  }, []);

  // controles somem sozinhos enquanto o vídeo toca
  useEffect(() => {
    if (!uiOn || !playing || menu || overlay) return;
    const t = window.setTimeout(() => setUiOn(false), 3800);
    return () => window.clearTimeout(t);
  }, [uiOn, playing, menu, overlay, uiTick]);

  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end" }); }, [messages, tab]);

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

  async function share() {
    const r = await shareLink({
      title: room.title,
      text: `Vem assistir ${room.movie_title} comigo na sala "${room.title}"${room.is_private ? " (sala com senha — peça ao anfitrião)" : ""}`,
      url: window.location.href,
    });
    if (r === "shared") return;
    setShareMsg(r === "copied" ? "Link copiado" : "Não deu pra copiar");
    setTimeout(() => setShareMsg(""), 2200);
  }
  const hostId = room.host_user_id;

  const seekCommit = (v: number) => { if (isHost && duration > 0) player().seek((v / 1000) * duration); dragging.current = false; bumpUi(); };
  const showUi = uiOn || !playing || !!overlay;
  const pctDone = duration > 0 && isFinite(duration) ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className={`rm2${nativeFs ? " fs" : ""}${isNative ? " native" : ""}`} id="sala-page">
      <header className="rm2-head">
        <Link to="/salas" className="rm2-round" aria-label="Voltar às salas"><Icon name="arrowLeft" size={22} strokeWidth={2.4} /></Link>
        <div className="rm2-titles">
          <h1>{room.title}</h1>
          <p>
            <span className="rm2-what">{room.movie_title}</span>
            {room.media_type === "tv" && room.season != null && <span className="rm2-ep">T{room.season} · E{room.episode}</span>}
          </p>
        </div>
        <button type="button" className="rm2-round" onClick={() => void share()} aria-label="Convidar pessoas">
          <Icon name={shareMsg ? "check" : "share"} size={20} />
        </button>
      </header>

      <div className="rm2-chips">
        <span className={`rm2-chip live${badge.offline ? " off" : ""}`}><i />{badge.text.replace(/^●\s*/, "")}</span>
        <span className="rm2-chip"><Icon name="users" size={14} />{participants.length || 1} online</span>
        {room.is_private && <span className="rm2-chip"><IconLock width={13} height={13} />Privada</span>}
        {isHost ? <span className="rm2-chip host"><Icon name="crown" size={14} />Você controla</span> : <span className="rm2-chip">Anfitrião: <StaffName name={room.host_name} userId={room.host_user_id} /></span>}
      </div>

      <div className="rm2-stage-wrap" ref={wrapperRef}>
        <div className="rm2-stage" ref={stageRef} onClick={() => (uiOn ? setUiOn(false) : bumpUi())}>
          {!isNative && (
            <video ref={videoRef} playsInline crossOrigin="anonymous" />
          )}
        </div>

        {videoStatus && <div className="rm2-status"><span className="rm2-spin" />{videoStatus}</div>}
        {banner && <div className="rm2-banner">{banner}</div>}

        <div className="rm2-float">
          {floating.map((f) => <div key={f.key}><strong><StaffName name={f.name} userId={f.uid} /></strong>{f.text}</div>)}
        </div>
        <div className="rm2-react">
          {reactions.map((r) => <span key={r.key} style={{ left: `${r.left}%` }}>{r.emoji}</span>)}
        </div>

        {overlay && (
          <div className="rm2-start">
            <button type="button" onClick={() => void startFromOverlay()} aria-label={overlay}><Icon name="play" size={38} /></button>
            <span>{overlay}</span>
          </div>
        )}

        <div className={`rm2-ui${showUi ? " on" : ""}`}>
          <div className="rm2-emojis">
            {EMOJIS.map((e) => <button key={e} type="button" onClick={() => { showReaction(e); channel().broadcastControl("reaction", 0, { emoji: e }); bumpUi(); }}>{e}</button>)}
          </div>

          {isHost && !overlay && (
            <div className="rm2-center">
              <button type="button" aria-label="Voltar 10 segundos" onClick={() => { player().seek(player().getCurrentTime() - 10); bumpUi(); }}><Icon name="rew10" size={34} strokeWidth={1.9} /></button>
              <button type="button" className="big" aria-label={playing ? "Pausar" : "Reproduzir"} onClick={() => { (player().isPlaying() ? player().pause() : void player().play()); bumpUi(); }}>
                <Icon name={playing ? "pause" : "play"} size={38} />
              </button>
              <button type="button" aria-label="Avançar 10 segundos" onClick={() => { player().seek(player().getCurrentTime() + 10); bumpUi(); }}><Icon name="fwd10" size={34} strokeWidth={1.9} /></button>
            </div>
          )}
          {!isHost && !overlay && <div className="rm2-guest"><Icon name="lock" size={14} /> {playing ? "Reproduzindo junto com o anfitrião" : "Aguardando o anfitrião"}</div>}

          <div className="rm2-bar">
            <div className="rm2-seek">
              <span>{fmt(time)}</span>
              <input type="range" min={0} max={1000} step={1} disabled={!isHost} style={{ "--p": `${pctDone}%` } as CSSProperties}
                value={duration > 0 && isFinite(duration) ? (time / duration) * 1000 : 0}
                onChange={(e) => { dragging.current = true; setTime((Number(e.target.value) / 1000) * (duration || 0)); bumpUi(); }}
                onPointerUp={(e) => seekCommit(Number(e.currentTarget.value))}
                onKeyUp={(e) => seekCommit(Number(e.currentTarget.value))} />
              <span>{fmt(duration)}</span>
            </div>
            <div className="rm2-row">
              <div className="rm2-vol">
                <Icon name={volume === 0 ? "volumeOff" : "volume"} size={20} />
                <input type="range" min={0} max={100} value={volume} style={{ "--p": `${volume}%` } as CSSProperties} onChange={(e) => { setVolume(Number(e.target.value)); bumpUi(); }} />
              </div>
              <span className="rm2-sp" />
              {subs.length > 0 && <button type="button" aria-label="Legendas" onClick={() => { setSubNow(player().getCurrentSubtitleTrack()); setMenu(menu === "subs" ? null : "subs"); bumpUi(); }}><Icon name="captions" size={22} /></button>}
              {levels.length > 1 && <button type="button" aria-label="Qualidade" onClick={() => { setQualityNow(player().getCurrentQualityLevel()); setMenu(menu === "quality" ? null : "quality"); bumpUi(); }}><Icon name="settings" size={21} /></button>}
              <button type="button" aria-label="Tela cheia"
                onClick={() => { bumpUi(); if (isNative) setNativeFs((v) => !v); else if (document.fullscreenElement) void document.exitFullscreen(); else void wrapperRef.current?.requestFullscreen?.(); }}>
                <Icon name={nativeFs ? "minimize" : "maximize"} size={21} />
              </button>
            </div>
            <div className={`rm2-sync${syncInfo ? " aviso" : ""}`}>{syncInfo}</div>
          </div>
        </div>

        {menu && (
          <div className="rm2-sheet-bg" onClick={() => setMenu(null)}>
            <div className="rm2-sheet" onClick={(e) => e.stopPropagation()}>
              <b>{menu === "subs" ? "Legendas" : "Qualidade"}</b>
              {menu === "subs" ? (
                <>
                  <button type="button" className={subNow === -1 ? "on" : ""} onClick={() => { player().setSubtitleTrack(-1); setSubNow(-1); setMenu(null); }}>Desligadas</button>
                  {subs.map((x) => <button key={x.index} type="button" className={subNow === x.index ? "on" : ""} onClick={() => { player().setSubtitleTrack(x.index); setSubNow(x.index); setMenu(null); }}>{x.label}</button>)}
                </>
              ) : (
                <>
                  <button type="button" className={qualityNow === -1 ? "on" : ""} onClick={() => { player().setQualityLevel(-1); setQualityNow(-1); setMenu(null); }}>Automática</button>
                  {[...levels].sort((a, b) => (b.height || 0) - (a.height || 0)).map((l) => (
                    <button key={l.index} type="button" className={qualityNow === l.index ? "on" : ""} onClick={() => { player().setQualityLevel(l.index); setQualityNow(l.index); setMenu(null); }}>
                      {l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rm2-body">
        {prompt && (
          <div className="rm2-prompt">
            <p>Episódio terminou. Avançar para o próximo?</p>
            <div>
              <button type="button" className="yes" onClick={() => { const pr = prompt; setPrompt(null); void avancar(pr.season, pr.episode); }}>Sim, avançar</button>
              <button type="button" onClick={() => setPrompt(null)}>Agora não</button>
            </div>
          </div>
        )}

        {isHost && (
          <div className="rm2-host">
            <button type="button" onClick={() => player().pause()}><Icon name="pause" size={18} />Pausar para todos</button>
            <button type="button" onClick={() => {
              const t = player().getCurrentTime();
              channel().broadcastControl("seek", t);
              updateRoomState(roomRef.current.id, player().isPlaying(), t).catch(() => {});
              flashBadge("Sincronizado!");
            }}><Icon name="sync" size={18} />Sincronizar</button>
            <button type="button" className="danger" onClick={() => void endRoom()}>Encerrar</button>
          </div>
        )}

        <div className="rm2-tabs" role="tablist">
          {([["chat", "Chat", 0], ["fila", "Fila", queue.length], ["pessoas", "Pessoas", participants.length]] as const).map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}{n > 0 && <b>{n}</b>}
            </button>
          ))}
        </div>

        <section className="rm2-pane" hidden={tab !== "chat"}>
          <div className="rm2-msgs">
            {!messages.length && <p className="rm2-hint">Nenhuma mensagem ainda. Diga oi 👋</p>}
            {messages.map((m) => m.system
              ? <div key={m.key} className="rm2-sys">{m.text}</div>
              : <div key={m.key} className={`rm2-msg${m.mine ? " mine" : ""}`}><strong>{m.mine ? "Você" : <StaffName name={m.name ?? ""} userId={m.uid} />}</strong><span>{m.text}</span></div>)}
            <div ref={chatEnd} />
          </div>
          {chatError && <p className="rm2-err">{chatError}</p>}
          <form className="rm2-form" onSubmit={(e) => void onSend(e)}>
            <input type="text" maxLength={500} placeholder="Escreva uma mensagem…" autoComplete="off" value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
            <button type="submit" aria-label="Enviar" disabled={!chatInput.trim()}><Icon name="send" size={19} /></button>
          </form>
        </section>

        <section className="rm2-pane" hidden={tab !== "fila"}>
          <button type="button" className="rm2-add" onClick={() => setQueueOpen((o) => !o)}>{queueOpen ? "Cancelar" : "+ Adicionar à fila"}</button>
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
          {!queue.length && !queueOpen && <p className="rm2-hint">A fila está vazia. Adicione o próximo filme ou série.</p>}
          {queue.map((item) => (
            <div key={item.id} className="rm2-q">
              <img src={item.poster_path ? posterUrl(item.poster_path, "w200") : "/assets/no-poster.png"} alt="" />
              <div><strong>{item.movie_title}</strong><span>adicionado por {item.added_by_name}</span></div>
              {isHost && <button type="button" className="play" aria-label="Tocar agora" onClick={() => void playQueueItem(item)}><Icon name="play" size={18} /></button>}
              {(isHost || item.added_by_user_id === userId) && (
                <button type="button" className="del" aria-label="Remover" onClick={() => removeFromQueue(item.id).catch(() => {})}><Icon name="close" size={17} /></button>
              )}
            </div>
          ))}
        </section>

        <section className="rm2-pane" hidden={tab !== "pessoas"}>
          {!participants.length && <p className="rm2-hint">Conectando…</p>}
          {participants.map((p) => {
            const name = p.display_name || "?";
            const isRoomHost = p.user_id === hostId;
            return (
              <div key={p.user_id} className="rm2-person">
                {p.avatar_url
                  ? <img className="rm2-av" src={p.avatar_url} alt="" />
                  : <span className="rm2-av" style={{ background: avatarColor(name) }}>{(name[0] || "?").toUpperCase()}</span>}
                <span className="rm2-pname"><StaffName name={name} userId={p.user_id} />{p.user_id === userId && <em> (você)</em>}</span>
                {isRoomHost
                  ? <span className="rm2-ptag"><Icon name="crown" size={13} />Anfitrião</span>
                  : isHost && <button type="button" className="rm2-make" onClick={() => void makeHost(p.user_id, name)}>Tornar anfitrião</button>}
              </div>
            );
          })}
        </section>
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

  const preset = (useLocation().state as { room?: RoomRow } | null)?.room;
  const [room, setRoom] = useState<RoomRow | null>(preset && preset.id === roomId ? preset : null);
  const [needPassword, setNeedPassword] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [fatal, setFatal] = useState("");
  const tried = useRef(false);

  const enter = useCallback(async (password: string | null) => {
    try {
      setRoom(await joinRoom(roomId!, password, displayName));
      setNeedPassword(null);
    } catch (e) {
      const msg = (e as { message?: string } | null)?.message ?? "";
      if (/senha/i.test(msg)) setNeedPassword(password ? "Senha incorreta. Confira e tente de novo." : "");
      else setFatal(msg || "Não foi possível entrar nessa sala.");
    }
  }, [roomId, displayName]);

  useEffect(() => {
    if (!roomId || tried.current || room) return;
    tried.current = true;
    void enter(null);
  }, [roomId, enter, room]);

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
          <form className="salas-modal-box rl-pwbox" onSubmit={(e) => { e.preventDefault(); if (pw) void enter(pw); }}>
            <span className="rl-pwicon"><IconLock width={22} height={22} /></span>
            <h2>Sala com senha</h2>
            <p className="rl-pwname">Digite a senha para entrar.</p>
            <div className="rl-pwfield">
              <input type="password" placeholder="Senha" autoFocus autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <p className="salas-erro" role="alert">{needPassword}</p>
            <button type="submit" className="btn-primary" disabled={!pw}>Entrar na sala</button>
            <Link className="rl-pwback" to="/salas">Voltar às salas</Link>
          </form>
        </div>
      ) : (
        <p style={{ padding: 24, color: "#fff" }}>Entrando na sala…</p>
      )}
    </div>
  );
}
