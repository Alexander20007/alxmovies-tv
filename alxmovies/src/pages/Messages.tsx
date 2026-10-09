import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoomInviteCard, SocAvatar, SocialGate, TitleCard } from "@/components/social/SocUi";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useFriendships } from "@/hooks/useSocialData";
import { filterForProfile } from "@/lib/contentFilter";
import { clockTime, isLive, messagePreview, timeAgo, watchAlongHref, watchingLabel } from "@/lib/social";
import { getFriendMessages, markConversationRead, sendFriendMessage, type FriendMessage, type FriendRow } from "@/services/friends";
import { listPublicRooms } from "@/services/rooms";
import { posterUrl, tmdb } from "@/services/tmdb";
import { useBackClose } from "@/hooks/useBackClose";
import { BusyButton } from "@/components/Spinner";

const PAGE_SIZE = 50;

function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(t) - start(d)) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function TitlePicker({ onPick, onClose }: { onPick: (p: Record<string, unknown>) => void; onClose: () => void }) {
  useBackClose(true, onClose);
  const { activeProfile } = useProfile();
  const [term, setTerm] = useState("");
  const q = useDebounce(term.trim());
  const res = useQuery({ queryKey: ["chat-title-search", q], queryFn: () => tmdb.search(q, "multi"), enabled: !!q });
  const items = filterForProfile((res.data?.results ?? []).filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path), activeProfile).slice(0, 10);

  return (
    <div className="soc-modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="soc-modal-box">
        <button type="button" className="soc-modal-close" aria-label="Fechar" onClick={onClose}>×</button>
        <h2>Indicar filme ou série</h2>
        <input type="text" placeholder="Digite o nome..." autoComplete="off" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} />
        <div className="soc-pick-list">
          {!q && <p className="soc-empty">Digite pra buscar um filme ou série.</p>}
          {q && res.isFetching && <p className="soc-empty">Buscando...</p>}
          {q && res.isError && <p className="soc-empty">Erro ao buscar. Tente de novo.</p>}
          {q && res.data && !res.isFetching && !items.length && <p className="soc-empty">Nada encontrado pra “{q}”.</p>}
          {items.map((r) => {
            const title = r.title ?? r.name ?? "";
            const year = (r.release_date ?? r.first_air_date ?? "").slice(0, 4);
            return (
              <button key={r.id} type="button" className="soc-pick"
                onClick={() => onPick({ media_id: r.id, media_type: r.media_type, title, poster_path: r.poster_path, year: year || null })}>
                <img src={posterUrl(r.poster_path, "w92")} alt="" loading="lazy" />
                <span><b>{title}</b><small>{r.media_type === "tv" ? "Série" : "Filme"}{year ? ` · ${year}` : ""}</small></span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoomPicker({ onPick, onClose }: { onPick: (p: Record<string, unknown>) => void; onClose: () => void }) {
  useBackClose(true, onClose);
  const { user } = useAuth();
  const rooms = useQuery({ queryKey: ["my-hosted-rooms"], queryFn: async () => (await listPublicRooms()).filter((r) => r.host_user_id === user?.id) });
  return (
    <div className="soc-modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="soc-modal-box">
        <button type="button" className="soc-modal-close" aria-label="Fechar" onClick={onClose}>×</button>
        <h2>Convidar pra uma sala</h2>
        <div className="soc-pick-list">
          {rooms.isLoading && <p className="soc-empty">Procurando suas salas...</p>}
          {rooms.isError && <p className="soc-empty">{(rooms.error as Error).message}</p>}
          {rooms.data && !rooms.data.length && (
            <>
              <p className="soc-empty">Você não tem nenhuma sala ativa agora.</p>
              <Link className="soc-btn primary" style={{ alignSelf: "center" }} to="/salas">Criar uma sala</Link>
            </>
          )}
          {rooms.data?.map((r) => (
            <button key={r.id} type="button" className="soc-pick"
              onClick={() => onPick({ room_id: r.id, title: r.title, movie_title: r.movie_title, poster_path: r.poster_path || null })}>
              <img src={r.poster_path ? posterUrl(r.poster_path, "w92") : "/assets/no-poster.png"} alt="" />
              <span><b>{r.title}</b><small>{r.movie_title}{r.has_password ? " · 🔒 com senha" : ""}</small></span>
            </button>
          ))}
          {!!rooms.data?.length && <p className="soc-note">Salas com senha: seu amigo precisa saber a senha pra entrar.</p>}
        </div>
      </div>
    </div>
  );
}

function Conversation({ friend, onBack }: { friend: FriendRow; onBack: () => void }) {
  useBackClose(true, onBack);
  const { activeProfile } = useProfile();
  const social = useSocial();
  const qc = useQueryClient();
  const pid = activeProfile!.id;
  const fid = friend.friendship_id;

  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [modal, setModal] = useState<null | "title" | "room">(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const scroll = useRef<{ mode: "bottom" | "keep" | null; gap: number }>({ mode: "bottom", gap: 0 });

  const markRead = useCallback(() => {
    markConversationRead(pid, fid).then(() => {
      void qc.invalidateQueries({ queryKey: ["unread", pid] });
      void qc.invalidateQueries({ queryKey: ["friendships", pid] });
    }).catch(() => {});
  }, [pid, fid, qc]);

  const addMessage = useCallback((m: FriendMessage) => {
    const box = boxRef.current;
    const near = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    scroll.current = { mode: near || m.sender_id === pid ? "bottom" : "keep", gap: box ? box.scrollHeight - box.scrollTop : 0 };
    setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur
      : [...cur, m].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())));
  }, [pid]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getFriendMessages(fid, { limit: PAGE_SIZE })
      .then((page) => { if (!alive) return; scroll.current = { mode: "bottom", gap: 0 }; setMessages(page); setHasMore(page.length === PAGE_SIZE); markRead(); })
      .catch((e) => alive && setLoadError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [fid, markRead]);

  useEffect(() => {
    const offMsg = social.on("message", (m: FriendMessage) => {
      if (m.friendship_id !== fid) return;
      addMessage(m);
      if (m.sender_id !== pid && document.visibilityState === "visible") markRead();
    });
    const offUpd = social.on("message-update", (m: FriendMessage) => {
      if (m.friendship_id !== fid) return;
      scroll.current = { mode: "keep", gap: boxRef.current ? boxRef.current.scrollHeight - boxRef.current.scrollTop : 0 };
      setMessages((cur) => cur.map((x) => (x.id === m.id && x.read_at !== m.read_at ? { ...x, read_at: m.read_at } : x)));
    });
    const onVisible = () => { if (document.visibilityState === "visible") markRead(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { offMsg(); offUpd(); document.removeEventListener("visibilitychange", onVisible); };
  }, [social, fid, pid, addMessage, markRead]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (scroll.current.mode === "bottom") box.scrollTop = box.scrollHeight;
    else if (scroll.current.mode === "keep") box.scrollTop = box.scrollHeight - scroll.current.gap;
    scroll.current.mode = null;
  }, [messages]);

  useEffect(() => {
    if (!attachOpen) return;
    const close = () => setAttachOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [attachOpen]);

  async function loadOlder() {
    if (!messages.length) return;
    const box = boxRef.current;
    try {
      const older = await getFriendMessages(fid, { before: messages[0].created_at, limit: PAGE_SIZE });
      scroll.current = { mode: "keep", gap: box ? box.scrollHeight - box.scrollTop : 0 };
      setHasMore(older.length === PAGE_SIZE);
      setMessages((cur) => [...older.filter((o) => !cur.some((m) => m.id === o.id)), ...cur]);
    } catch { /* o botão continua disponível */ }
  }

  async function send(kind: "text" | "title" | "room" = "text", payload: unknown = null) {
    const body = kind === "text" ? text.trim() : "";
    if ((kind === "text" && !body) || sending) return;
    setSending(true); setError("");
    try {
      const m = await sendFriendMessage(pid, fid, body, kind, payload);
      if (kind === "text") setText("");
      setModal(null);
      addMessage(m);
      void qc.invalidateQueries({ queryKey: ["friendships", pid] });
    } catch (e) {
      setModal(null);
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  const live = isLive(friend);
  let lastDay = "";

  return (
    <div className="chat-conv" style={{ display: "flex" }}>
      <header className="chat-conv-head">
        <button type="button" className="chat-back" aria-label="Voltar às conversas" onClick={onBack}>←</button>
        <SocAvatar name={friend.friend_name} avatar={friend.friend_avatar} color={friend.friend_color} live={live} />
        <div className="chat-head-info">
          <strong>{friend.friend_name}</strong>
          {friend.watching_title && (live
            ? <span className="chat-head-status live">▶ Assistindo <b>{watchingLabel(friend)}</b> · <Link to={watchAlongHref(friend)}>assistir também</Link></span>
            : <span className="chat-head-status">Assistiu <b>{watchingLabel(friend)}</b> · {timeAgo(friend.watching_at)}</span>)}
        </div>
      </header>

      <div className="chat-msgs" ref={boxRef}>
        {loading && <p className="soc-empty">Carregando...</p>}
        {loadError && <p className="soc-empty">{loadError}</p>}
        {!loading && !loadError && !messages.length && <p className="soc-empty">Nenhuma mensagem ainda. Diga oi! 👋</p>}
        {hasMore && messages.length > 0 && <button type="button" className="chat-more" onClick={() => void loadOlder()}>Carregar mensagens anteriores</button>}
        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const header = day !== lastDay ? <div key={`d-${m.id}`} className="chat-day"><span>{day}</span></div> : null;
          lastDay = day;
          const mine = m.sender_id === pid;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {header}
              <div className={`msg ${mine ? "mine" : "theirs"}`}>
                <div className={`msg-bubble ${m.kind !== "text" ? "has-card" : ""}`}>
                  {m.kind === "title" && <TitleCard payload={m.payload} />}
                  {m.kind === "room" && <RoomInviteCard payload={m.payload} />}
                  {m.body && <p>{m.body}</p>}
                  <span className="msg-meta">{clockTime(m.created_at)}{mine && <> <i className={`msg-tick ${m.read_at ? "read" : ""}`}>{m.read_at ? "✓✓" : "✓"}</i></>}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-composer">
        <div className="chat-attach-wrap" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="chat-attach" aria-label="Anexar" onClick={() => setAttachOpen((o) => !o)}>＋</button>
          <div className={`soc-menu chat-attach-menu${attachOpen ? " open" : ""}`}>
            <button type="button" onClick={() => { setAttachOpen(false); setModal("title"); }}>🎬 Indicar filme/série</button>
            <button type="button" onClick={() => { setAttachOpen(false); setModal("room"); }}>👥 Convidar pra minha sala</button>
          </div>
        </div>
        <input type="text" placeholder="Escreva uma mensagem..." maxLength={1000} autoComplete="off" value={text} autoFocus={window.matchMedia("(min-width: 801px)").matches}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <BusyButton type="button" className="chat-send" aria-label="Enviar" loading={sending} onClick={() => void send()}>➤</BusyButton>
      </div>
      <p className="chat-error">{error}</p>

      {modal === "title" && <TitlePicker onClose={() => setModal(null)} onPick={(p) => void send("title", p)} />}
      {modal === "room" && <RoomPicker onClose={() => setModal(null)} onPick={(p) => void send("room", p)} />}
    </div>
  );
}

function ChatApp() {
  const [params, setParams] = useSearchParams();
  const fid = params.get("chat");
  const lists = useFriendships();
  const friends = lists.data?.friends ?? [];
  const [filter, setFilter] = useState("");
  const current = friends.find((f) => f.friendship_id === fid) ?? null;

  useEffect(() => {
    document.body.classList.add("page-chat");
    return () => document.body.classList.remove("page-chat");
  }, []);

  const shown = friends.filter((f) => !filter.trim() || f.friend_name.toLowerCase().includes(filter.trim().toLowerCase()));
  const open = (id: string) => setParams({ chat: id }, { replace: true });
  const close = () => setParams({}, { replace: true });

  return (
    <div className={`chat-app${current ? " chat-open" : ""}`} style={{ display: "flex" }}>
      <aside className="chat-side">
        <div className="chat-side-head">
          <h1>Mensagens</h1>
          <Link className="soc-link-btn" to="/amigos">👥 Amigos</Link>
        </div>
        <input type="search" className="chat-filter" placeholder="Buscar amigo..." autoComplete="off" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="chat-list">
          {lists.isLoading && <p className="soc-empty">Carregando...</p>}
          {lists.isError && <p className="soc-empty">{(lists.error as Error).message}</p>}
          {lists.data && !friends.length && (
            <>
              <p className="soc-empty">Você ainda não tem amigos por aqui.</p>
              <Link className="soc-btn primary" style={{ alignSelf: "center" }} to="/amigos">➕ Adicionar amigos</Link>
            </>
          )}
          {!!friends.length && !shown.length && <p className="soc-empty">Nenhum amigo com esse nome.</p>}
          {shown.map((f) => (
            <button key={f.friendship_id} type="button" className={`chat-item ${f.friendship_id === fid ? "active" : ""}`} onClick={() => open(f.friendship_id)}>
              <SocAvatar name={f.friend_name} avatar={f.friend_avatar} color={f.friend_color} live={isLive(f)} />
              <span className="chat-item-body">
                <b>{f.friend_name}</b>
                <span className={`chat-item-preview ${f.unread_count > 0 ? "unread" : ""}`}>
                  {f.last_message_kind ? messagePreview(f.last_message_kind, f.last_message, f.last_message_mine) : "Toque pra iniciar a conversa"}
                </span>
              </span>
              <span className="chat-item-meta">
                {f.last_message_at && <small>{timeAgo(f.last_message_at)}</small>}
                {f.unread_count > 0 && <span className="soc-pill">{f.unread_count}</span>}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        {current
          ? <Conversation key={current.friendship_id} friend={current} onBack={close} />
          : <div className="chat-placeholder"><div className="soc-gate-ico">💬</div><p>Escolha uma conversa pra começar.</p></div>}
      </section>
    </div>
  );
}

export default function Messages() {
  return <SocialGate><ChatApp /></SocialGate>;
}
