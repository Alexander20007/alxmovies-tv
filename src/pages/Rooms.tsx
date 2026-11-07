import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useDebounce } from "@/hooks/useDebounce";
import { StaffName } from "@/components/VerifiedName";
import { createRoom, joinRoom, listMyRecentRooms, listPublicRooms, type RoomRow } from "@/services/rooms";
import { posterUrl, tmdb } from "@/services/tmdb";
import type { MediaType } from "@/types";
import { useBackClose } from "@/hooks/useBackClose";
import { BusyButton } from "@/components/Spinner";
import { IconChevron, IconEye, IconEyeOff, IconGlobe, IconLock, IconPlus } from "@/components/RoomIcons";

type Tab = "recentes" | "todas" | "publicas" | "series" | "filmes";
const TABS: { id: Tab; label: string }[] = [
  { id: "recentes", label: "Recentes" }, { id: "todas", label: "Todas" }, { id: "publicas", label: "Públicas" },
  { id: "series", label: "Séries" }, { id: "filmes", label: "Filmes" },
];
const EMPTY: Record<Tab, string> = {
  recentes: "Você ainda não entrou em nenhuma sala.",
  todas: "Nenhuma sala ativa agora. Crie a primeira!",
  publicas: "Nenhuma sala pública no momento.",
  series: "Nenhuma sala de série no momento.",
  filmes: "Nenhuma sala de filme no momento.",
};

interface Picked { tmdbId: number; mediaType: MediaType; title: string; posterPath: string | null }

function RoomCard({ room, onClick }: { room: RoomRow; onClick: () => void }) {
  const ep = room.media_type === "tv" && room.season != null ? `T${room.season} · E${room.episode}` : room.media_type === "tv" ? "Série" : "Filme";
  const initial = (room.host_name || "?").trim().charAt(0).toUpperCase();
  return (
    <button type="button" className="rl2-card" onClick={onClick}>
      <span className="rl2-poster">
        <img src={room.poster_path ? posterUrl(room.poster_path, "w500") : "/assets/no-poster.png"} alt="" loading="lazy" />
        <span className={`rl2-state${room.is_playing ? " live" : ""}`}><i />{room.is_playing ? "AO VIVO" : "PAUSADA"}</span>
        {room.is_private && <span className="rl2-lock"><IconLock width={14} height={14} /></span>}
        <span className="rl2-shade" />
        <span className="rl2-ep">{ep}</span>
      </span>
      <span className="rl2-body">
        <strong>{room.title}</strong>
        <span className="rl2-what">{room.movie_title}</span>
        <span className="rl2-foot">
          <span className="rl2-host"><b>{initial}</b><StaffName name={room.host_name} userId={room.host_user_id} /></span>
          <span className="rl2-go">Entrar<IconChevron width={15} height={15} /></span>
        </span>
      </span>
    </button>
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
      navigate(`/sala?id=${room.id}`, { state: { room } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar a sala.");
      setBusy(false);
    }
  }

  return createPortal(
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
    </div>,
    document.body,
  );
}

export default function Rooms() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const [chosen, setChosen] = useState<Tab | null>(null);
  const [creating, setCreating] = useState(false);
  const [deepLink, setDeepLink] = useState<Picked | null>(null);
  const [pwRoom, setPwRoom] = useState<RoomRow | null>(null);
  useBackClose(!!pwRoom, () => setPwRoom(null));
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState("");
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState("");

  const rooms = useQuery({ queryKey: ["rooms"], queryFn: listPublicRooms, refetchInterval: 15000 });
  const recent = useQuery({ queryKey: ["rooms-recent"], queryFn: () => listMyRecentRooms(12) });

  // Vindo do botão "Sala" da página de detalhes
  useEffect(() => {
    const tmdbId = params.get("tmdbId");
    if (!tmdbId) return;
    setDeepLink({ tmdbId: Number(tmdbId), mediaType: (params.get("mediaType") as MediaType) || "movie", title: params.get("title") ?? "", posterPath: params.get("poster") || null });
    setCreating(true);
  }, [params]);

  // Abre em "Recentes" se a pessoa já tem salas; senão em "Todas"
  const tab: Tab | null = chosen ?? (recent.isPending ? null : recent.data?.length ? "recentes" : "todas");
  const all = rooms.data ?? [];
  const lists: Record<Tab, RoomRow[]> = {
    recentes: recent.data ?? [],
    todas: all,
    publicas: all.filter((r) => !r.is_private),
    series: all.filter((r) => r.media_type === "tv"),
    filmes: all.filter((r) => r.media_type === "movie"),
  };
  const list = tab ? lists[tab] : [];
  const loading = tab === null || (tab === "recentes" ? recent.isLoading : rooms.isLoading);
  const failed = tab !== null && (tab === "recentes" ? recent.isError : rooms.isError);

  async function enter(room: RoomRow, password: string | null) {
    setJoining(true); setNotice("");
    try {
      const joined = await joinRoom(room.id, password, activeProfile?.name || user?.email || "Convidado");
      navigate(`/sala?id=${room.id}`, { state: { room: joined } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const wrongPw = /senha/i.test(msg);
      if (wrongPw && password === null) { setPw(""); setPwError(""); setPwRoom(room); }        // precisa digitar a senha
      else if (wrongPw) setPwError("Senha incorreta. Confira e tente de novo.");
      else if (pwRoom) setPwError(msg || "Não foi possível entrar na sala.");
      else setNotice(msg || "Não foi possível entrar na sala.");
      setJoining(false);
    }
  }
  // Sala com senha abre o pedido de senha; quem já entrou antes (Recentes) tenta direto
  const click = (room: RoomRow) => {
    if (room.has_password && tab !== "recentes") { setPw(""); setPwError(""); setShowPw(false); setPwRoom(room); return; }
    void enter(room, null);
  };

  return (
    <div className="rl-page rl2">
      <header className="rl2-hero">
        <div className="rl2-glow" aria-hidden />
        <span className="rl2-kicker">ASSISTA JUNTO</span>
        <h1>Salas</h1>
        <p>Filmes e séries em sincronia com quem você quiser, com chat e reações ao vivo.</p>
        <div className="rl2-stats">
          <span><b>{(rooms.data ?? []).length}</b> ativas</span>
          <span><b>{(rooms.data ?? []).filter((r) => r.is_playing).length}</b> ao vivo agora</span>
        </div>
        <button type="button" id="btn-criar-sala" className="rl2-create" onClick={() => { setDeepLink(null); setCreating(true); }}>
          <IconPlus width={20} height={20} /><span>Criar sala</span>
        </button>
      </header>

      <div className="rl2-tabs" role="tablist" aria-label="Filtrar salas">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`rl2-tab${tab === t.id ? " on" : ""}`} onClick={() => setChosen(t.id)}>
            {t.label}{(t.id === "recentes" ? recent.data : rooms.data) && lists[t.id].length > 0 && <small>{lists[t.id].length}</small>}
          </button>
        ))}
      </div>

      {notice && <div className="rl-notice" role="alert"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fechar">×</button></div>}

      <div className="rl2-grid">
        {loading && [0, 1, 2, 3].map((i) => <div key={i} className="rl2-skel" />)}
        {!loading && failed && <div className="rl2-empty"><span>⚠️</span><p>Não foi possível carregar as salas.</p></div>}
        {!loading && !failed && !list.length && tab && <div className="rl2-empty"><span>🍿</span><p>{EMPTY[tab]}</p><button type="button" onClick={() => { setDeepLink(null); setCreating(true); }}>Criar a primeira sala</button></div>}
        {!loading && !failed && list.map((r) => <RoomCard key={r.id} room={r} onClick={() => click(r)} />)}
      </div>

      {creating && <CreateModal initial={deepLink} onClose={() => setCreating(false)} />}

      {pwRoom && createPortal(
        <div className="salas-modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setPwRoom(null)}>
          <form className="salas-modal-box rl-pwbox" onSubmit={(e) => { e.preventDefault(); if (pw) void enter(pwRoom, pw); }}>
            <button type="button" className="salas-modal-close" onClick={() => setPwRoom(null)} aria-label="Fechar">×</button>
            <span className="rl-pwicon"><IconLock width={22} height={22} /></span>
            <h2>Sala com senha</h2>
            <p className="rl-pwname">{pwRoom.title}</p>
            <div className="rl-pwfield">
              <input type={showPw ? "text" : "password"} placeholder="Digite a senha" autoFocus autoComplete="off" value={pw}
                onChange={(e) => { setPw(e.target.value); setPwError(""); }} />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}>
                {showPw ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
              </button>
            </div>
            <p className="salas-erro" role="alert">{pwError}</p>
            <BusyButton type="submit" className="btn-primary" loading={joining} disabled={!pw}>Entrar na sala</BusyButton>
          </form>
        </div>,
        document.body,
      )}
    </div>
  );
}
