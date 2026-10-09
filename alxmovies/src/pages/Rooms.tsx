import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useDebounce } from "@/hooks/useDebounce";
import { createRoom, joinRoom, listMyRecentRooms, listPublicRooms, type RoomRow } from "@/services/rooms";
import { posterUrl, tmdb } from "@/services/tmdb";
import type { MediaType } from "@/types";
import { useBackClose } from "@/hooks/useBackClose";
import { BusyButton } from "@/components/Spinner";

type Filter = "todas" | "movie" | "tv" | "publicas";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "todas", label: "Todas" }, { id: "movie", label: "🎬 Filmes" }, { id: "tv", label: "📺 Séries" }, { id: "publicas", label: "🔓 Só públicas" },
];

interface Picked { tmdbId: number; mediaType: MediaType; title: string; posterPath: string | null }

function RoomCard({ room, onClick }: { room: RoomRow; onClick: () => void }) {
  return (
    <div className={`sala-card${room.is_playing ? " assistindo" : ""}`} onClick={onClick}>
      <img src={room.poster_path ? posterUrl(room.poster_path, "w300") : "/assets/no-poster.png"} alt="" />
      <div className="sala-card-info">
        <h3>{room.title}</h3>
        <p>{room.movie_title} · Anfitrião: {room.host_name}</p>
        <span className={`sala-card-live${room.is_playing ? "" : " pausado"}`}>{room.is_playing ? "Assistindo agora" : "Pausado"}</span>
        <div className="sala-card-tags">
          {room.media_type === "tv" ? <span className="tv">📺 Série</span> : <span>🎬 Filme</span>}
          {room.is_private ? <span className="privada">🔒 Privada</span> : <span className="publica">🌐 Pública</span>}
        </div>
      </div>
      <button type="button" className="sala-card-join">ENTRAR</button>
    </div>
  );
}

function CreateModal({ initial, onClose }: { initial: Picked | null; onClose: () => void }) {
  useBackClose(true, onClose);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const [title, setTitle] = useState(initial?.title ? `Assistindo ${initial.title}` : "");
  const [picked, setPicked] = useState<Picked | null>(initial);
  const [term, setTerm] = useState("");
  const q = useDebounce(term.trim());
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [limit, setLimit] = useState("");
  const [priv, setPriv] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const search = useQuery({ queryKey: ["room-search", q], queryFn: () => tmdb.search(q, "multi"), enabled: q.length >= 2 });
  const results = (search.data?.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 8);

  async function submit() {
    setError("");
    if (!title.trim()) return setError("Dê um nome pra sala.");
    if (!picked) return setError("Escolha um filme ou série.");
    if (priv && !password) return setError("Defina uma senha ou desmarque 'sala privada'.");
    const isTv = picked.mediaType === "tv";
    setBusy(true);
    try {
      const room = await createRoom({
        title: title.trim(), isPrivate: priv, password, tmdbId: picked.tmdbId, mediaType: picked.mediaType,
        season: isTv ? Number(season) : null, episode: isTv ? Number(episode) : null,
        movieTitle: picked.title, posterPath: picked.posterPath, hostProfileId: activeProfile?.id ?? null,
        hostName: activeProfile?.name || user?.email || "Anfitrião", seasonLimit: isTv && limit ? Number(limit) : null,
      });
      navigate(`/sala?id=${room.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar a sala.");
      setBusy(false);
    }
  }

  return (
    <div className="salas-modal" style={{ display: "flex" }}>
      <div className="salas-modal-box">
        <button type="button" className="salas-modal-close" onClick={onClose}>×</button>
        <h2>Criar sala</h2>

        <label>Nome da sala</label>
        <input type="text" maxLength={60} placeholder="Ex: Noite de filme" value={title} onChange={(e) => setTitle(e.target.value)} />

        <label>Filme ou série</label>
        <input type="text" placeholder="Digite o nome..." autoComplete="off" value={term} onChange={(e) => setTerm(e.target.value)} />
        <div className="salas-busca-resultados">
          {results.map((r) => (
            <div key={r.id} className="salas-busca-item"
              onClick={() => { setPicked({ tmdbId: r.id, mediaType: r.media_type as MediaType, title: r.title ?? r.name ?? "", posterPath: r.poster_path }); setTerm(""); }}>
              <img src={r.poster_path ? posterUrl(r.poster_path, "w200") : "/assets/no-poster.png"} alt="" />
              <span>{r.title ?? r.name} {r.media_type === "tv" ? "(série)" : ""}</span>
            </div>
          ))}
        </div>
        {picked && (
          <div className="salas-filme-selecionado" style={{ display: "flex" }}>
            <img src={picked.posterPath ? posterUrl(picked.posterPath, "w200") : "/assets/no-poster.png"} alt="" />
            <span>{picked.title}</span>
          </div>
        )}

        {picked?.mediaType === "tv" && (
          <div className="salas-tv-opcoes" style={{ display: "block" }}>
            <div className="salas-tv-opcoes-linha">
              <label>Temporada</label><input type="number" min={1} value={season} onChange={(e) => setSeason(e.target.value)} />
              <label>Episódio</label><input type="number" min={1} value={episode} onChange={(e) => setEpisode(e.target.value)} />
            </div>
            <label>Maratona: assistir até a temporada nº</label>
            <input type="number" min={1} placeholder="Deixe em branco pra perguntar antes de cada episódio" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
        )}

        <label className="salas-checkbox-label">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Sala privada (com senha)
        </label>
        {priv && <input type="password" placeholder="Senha da sala" maxLength={40} value={password} onChange={(e) => setPassword(e.target.value)} />}

        <BusyButton type="button" className="btn-primary" loading={busy} onClick={() => void submit()}>{busy ? "Criando…" : "Criar e entrar"}</BusyButton>
        <p className="salas-erro">{error}</p>
      </div>
    </div>
  );
}

export default function Rooms() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const [filter, setFilter] = useState<Filter>("todas");
  const [creating, setCreating] = useState(false);
  const [deepLink, setDeepLink] = useState<Picked | null>(null);
  const [pwRoom, setPwRoom] = useState<RoomRow | null>(null);
  useBackClose(!!pwRoom, () => setPwRoom(null));
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");

  const rooms = useQuery({ queryKey: ["rooms"], queryFn: listPublicRooms, refetchInterval: 15000 });
  const recent = useQuery({ queryKey: ["rooms-recent"], queryFn: () => listMyRecentRooms(6) });

  // Vindo do botão "Sala" da página de detalhes
  useEffect(() => {
    const tmdbId = params.get("tmdbId");
    if (!tmdbId) return;
    setDeepLink({ tmdbId: Number(tmdbId), mediaType: (params.get("mediaType") as MediaType) || "movie", title: params.get("title") ?? "", posterPath: params.get("poster") || null });
    setCreating(true);
  }, [params]);

  const list = (rooms.data ?? []).filter((r) =>
    filter === "movie" || filter === "tv" ? r.media_type === filter : filter === "publicas" ? !r.is_private : true);

  async function enter(room: RoomRow, password: string | null) {
    try {
      await joinRoom(room.id, password, activeProfile?.name || user?.email || "Convidado");
      navigate(`/sala?id=${room.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível entrar na sala.";
      if (pwRoom) setPwError(msg); else alert(msg);
    }
  }
  const click = (room: RoomRow) => {
    if (!room.has_password) return void enter(room, null);
    setPw(""); setPwError(""); setPwRoom(room);
  };

  return (
    <div className="salas-page">
      <div className="salas-header">
        <h1>Salas</h1>
        <button type="button" id="btn-criar-sala" className="btn-primary" onClick={() => { setDeepLink(null); setCreating(true); }}>+ Criar sala</button>
      </div>
      <p className="salas-sub">Assista um filme ou série ao mesmo tempo que outras pessoas, com chat ao vivo.</p>

      {!!recent.data?.length && (
        <div className="salas-recentes-section" style={{ display: "block" }}>
          <h2 className="salas-subtitulo">Suas salas recentes</h2>
          <div className="salas-grid">{recent.data.map((r) => <RoomCard key={r.id} room={r} onClick={() => click(r)} />)}</div>
        </div>
      )}

      <div className="salas-filtros">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`salas-filtro-btn${filter === f.id ? " ativo" : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      <div className="salas-grid">
        {rooms.isLoading && <p className="salas-empty">Carregando salas...</p>}
        {rooms.isError && <p className="salas-empty">Não foi possível carregar as salas.</p>}
        {rooms.data && !list.length && (
          <p className="salas-empty">{rooms.data.length ? "Nenhuma sala corresponde a esse filtro." : "Nenhuma sala ativa agora. Crie a primeira!"}</p>
        )}
        {list.map((r) => <RoomCard key={r.id} room={r} onClick={() => click(r)} />)}
      </div>

      {creating && <CreateModal initial={deepLink} onClose={() => setCreating(false)} />}

      {pwRoom && (
        <div className="salas-modal" style={{ display: "flex" }}>
          <div className="salas-modal-box">
            <button type="button" className="salas-modal-close" onClick={() => setPwRoom(null)}>×</button>
            <h2>Sala privada</h2>
            <p>Essa sala pede uma senha pra entrar.</p>
            <input type="password" placeholder="Senha" autoFocus value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void enter(pwRoom, pw)} />
            <button type="button" className="btn-primary" onClick={() => void enter(pwRoom, pw)}>Entrar</button>
            <p className="salas-erro">{pwError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
