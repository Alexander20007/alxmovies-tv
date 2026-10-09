import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useProfile } from "@/context/ProfileContext";
import { isAllowedForProfile } from "@/lib/contentFilter";
import { getKnownOnlineChannels, type Channel } from "@/services/channels";
import { askMovieAssistant } from "@/services/gemini";
import { fetchMyList, fetchWatched } from "@/services/library";
import { listPublicRooms, type RoomRow } from "@/services/rooms";
import { posterUrl, tmdb } from "@/services/tmdb";
import { Icon } from "@/components/Icon";
import { isNative, shareLink } from "@/lib/native";
import { useBackClose } from "@/hooks/useBackClose";

interface MovieMatch {
  id: number; type: "movie" | "tv"; name: string; poster: string | null; year: string; overview: string;
  voteAverage: number; voteCount: number; genre: string; duration: string;
}
type Msg =
  | { key: number; kind: "text"; who: "bot" | "user" | "loading" | "error"; text: string }
  | { key: number; kind: "movies"; items: MovieMatch[] }
  | { key: number; kind: "channels"; items: Channel[] }
  | { key: number; kind: "rooms"; items: RoomRow[] };

const INTRO = 'Oi! Sou o assistente de IA do ALXmovies. Me diga um filme/série que você quer assistir, ou peça uma recomendação (ex: "quero um suspense parecido com Se7en"), que eu procuro no catálogo pra você.';

/** Texto da IA: **negrito** e quebras de linha, sem injetar HTML. */
function AiText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/\*\*(.+?)\*\*/g).map((part, j) => (j % 2 ? <strong key={j}>{part}</strong> : part))}
        </Fragment>
      ))}
    </>
  );
}

const voteCountLabel = (n: number) => (!n ? "0" : n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")} mil` : String(n));
const imgFallback = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; };

function MovieCard({ m }: { m: MovieMatch }) {
  const [copied, setCopied] = useState(false);
  const stars = Math.round((m.voteAverage || 0) / 2);
  const meta = [m.year, m.genre, m.duration].filter(Boolean).join(" • ");

  async function share() {
    const url = `${window.location.origin}/details?id=${m.id}&type=${m.type}`;
    const r = await shareLink({ title: `${m.name} — ALXmovies`, url });
    if (r === "copied") { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  }

  return (
    <div className="ai-movie-card">
      <img src={posterUrl(m.poster, "w185")} alt={m.name} onError={imgFallback} />
      <div className="ai-mc-info">
        <div className="ai-mc-title">{m.name}</div>
        {meta && <div className="ai-mc-meta">{meta}</div>}
        {m.voteAverage > 0 && (
          <>
            <div className="ai-mc-stars">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</div>
            <div className="ai-mc-rating">{m.voteAverage.toFixed(1)} • {voteCountLabel(m.voteCount)} avaliações</div>
          </>
        )}
        {m.overview && <div className="ai-mc-syn">{m.overview}</div>}
        <div className="ai-mc-btns">
          <Link className="ai-mc-btn ai-mc-watch" to={`/watch?id=${m.id}&type=${m.type}`}>▶ Assistir agora</Link>
          <button type="button" className={`ai-mc-btn ai-mc-share${copied ? " copiado" : ""}`} onClick={() => void share()}>{copied ? "✓ Link copiado" : "↗ Compartilhar"}</button>
        </div>
      </div>
    </div>
  );
}

export function AiAssistant() {
  const { activeProfile } = useProfile();
  const { openPlayer } = useChannelsUi();
  const [open, setOpen] = useState(false);
  useBackClose(open, () => setOpen(false));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ key: 0, kind: "text", who: "bot", text: INTRO }]);
  const nextKey = useRef(1);
  const box = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [messages]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const push = (m: Omit<Msg, "key"> | Msg) => {
    const key = nextKey.current++;
    setMessages((cur) => [...cur, { ...m, key } as Msg]);
    return key;
  };
  const drop = (key: number) => setMessages((cur) => cur.filter((m) => m.key !== key));

  async function findOnSite(titles: { title: string; type: string }[]): Promise<MovieMatch[]> {
    const seen = new Set<string>();
    const found = await Promise.all(titles.slice(0, 4).map(async ({ title }) => {
      try {
        const { results } = await tmdb.search(title, "multi");
        const hit = results.find((r) => r.media_type === "movie" || r.media_type === "tv");
        if (!hit || !isAllowedForProfile(hit, activeProfile)) return null;
        const key = `${hit.media_type}-${hit.id}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const m: MovieMatch = {
          id: hit.id, type: hit.media_type as "movie" | "tv", name: hit.title ?? hit.name ?? "", poster: hit.poster_path,
          year: (hit.release_date ?? hit.first_air_date ?? "").slice(0, 4), overview: hit.overview ?? "",
          voteAverage: hit.vote_average ?? 0, voteCount: (hit as any).vote_count ?? 0, genre: "", duration: "",
        };
        try {
          const full: any = await tmdb.details(m.type, m.id);
          m.genre = full.genres?.[0]?.name || "";
          m.overview = full.overview || m.overview;
          const mins = full.runtime || full.episode_run_time?.[0];
          if (mins) { const h = Math.floor(mins / 60), mm = mins % 60; m.duration = h > 0 ? `${h}h ${mm > 0 ? `${mm}min` : ""}`.trim() : `${mm}min`; }
        } catch { /* mantém o básico */ }
        return m;
      } catch { return null; }
    }));
    return found.filter((x): x is MovieMatch => !!x);
  }

  async function watchHistory(limit = 15) {
    const pid = activeProfile!.id;
    const [watched, favs] = await Promise.all([fetchWatched(pid, limit).catch(() => []), fetchMyList(pid).catch(() => [])]);
    const seen = new Set<string>();
    const out: { title: string; type: string }[] = [];
    [...watched, ...favs].forEach((i) => {
      const k = `${i.media_type}-${i.media_id}`;
      if (seen.has(k) || !i.title) return;
      seen.add(k); out.push({ title: i.title, type: i.media_type });
    });
    return out.slice(0, limit);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    push({ kind: "text", who: "user", text: question });
    setInput(""); setBusy(true);
    const loading = push({ kind: "text", who: "loading", text: "Pensando..." });
    try {
      const wantsChannels = /\bcanai?s?\b|\btv\s*(ao vivo|aberta)?\b|\bassistir ao vivo\b/i.test(question);
      const onlineChannels = wantsChannels ? await getKnownOnlineChannels(20) : [];
      const wantsRooms = /\bsalas?\b|\bassistir\s+junt[oa]\b|\bwatch\s*party\b/i.test(question);
      const onlineRooms = wantsRooms ? await listPublicRooms().catch(() => [] as RoomRow[]) : [];

      const { reply, titles, channels, rooms } = await askMovieAssistant(question, {
        onlineChannels, watchHistory: await watchHistory().catch(() => []),
        onlineRooms: onlineRooms.map((r) => ({ title: r.title, movieTitle: r.movie_title, hostName: r.host_name, hasPassword: !!r.has_password })),
      });
      drop(loading);
      push({ kind: "text", who: "bot", text: reply });

      if (titles.length) {
        const searching = push({ kind: "text", who: "loading", text: "Procurando no catálogo..." });
        const matches = await findOnSite(titles);
        drop(searching);
        if (matches.length) push({ kind: "movies", items: matches });
      }
      const chosenChannels = onlineChannels.filter((c) => channels.some((n) => n.toLowerCase() === (c.name || "").toLowerCase()));
      if (chosenChannels.length) push({ kind: "channels", items: chosenChannels });
      const chosenRooms = onlineRooms.filter((r) => rooms.some((n) => n.toLowerCase() === (r.title || "").toLowerCase()));
      if (chosenRooms.length) push({ kind: "rooms", items: chosenRooms });
    } catch (err) {
      drop(loading);
      push({ kind: "text", who: "error", text: err instanceof Error ? err.message : "Não consegui responder agora. Tente de novo." });
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  if (!activeProfile) return null;

  return (
    <>
      <button type="button" className="ai-assistant-toggle" aria-label="Assistente de IA" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>{isNative ? <Icon name="sparkles" size={26} /> : "✨"}</button>
      <div className={`ai-assistant-panel${open ? " open" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="ai-assistant-header">
          <span>✨ Assistente ALXmovies</span>
          <button type="button" id="ai-assistant-close" aria-label="Fechar" onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="ai-assistant-messages" ref={box}>
          {messages.map((m) => {
            if (m.kind === "text") return <div key={m.key} className={`ai-msg ai-msg-${m.who === "loading" ? "bot loading" : m.who === "error" ? "bot error" : m.who}`}><AiText text={m.text} /></div>;
            if (m.kind === "movies") return <Fragment key={m.key}>{m.items.map((it) => <MovieCard key={`${it.type}-${it.id}`} m={it} />)}</Fragment>;
            if (m.kind === "channels") {
              return (
                <div key={m.key} className="ai-results-row">
                  {m.items.map((c) => (
                    <button key={c.stream} type="button" className="ai-result-card ai-channel-card" onClick={() => openPlayer(c, m.items)}>
                      <img src={c.logo || "/assets/no-poster.png"} alt={c.name} onError={imgFallback} /><span>📡 {c.name}</span>
                    </button>
                  ))}
                </div>
              );
            }
            return (
              <div key={m.key} className="ai-results-row">
                {m.items.map((r) => (
                  <Link key={r.id} className="ai-result-card ai-room-card" to={`/sala?id=${r.id}`}>
                    <img src={r.poster_path ? posterUrl(r.poster_path, "w200") : "/assets/no-poster.png"} alt={r.title} onError={imgFallback} />
                    <span>👥 {r.title}{r.has_password ? " 🔒" : ""}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
        <form className="ai-assistant-form" onSubmit={(e) => void submit(e)}>
          <input ref={inputRef} type="text" placeholder="Pergunte algo sobre filmes e séries..." autoComplete="off" disabled={busy} value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="submit" disabled={busy} aria-label="Enviar">➤</button>
        </form>
      </div>
    </>
  );
}
