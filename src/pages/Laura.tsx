import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useProfile } from "@/context/ProfileContext";
import { isAllowedForProfile } from "@/lib/contentFilter";
import { isNative, shareLink } from "@/lib/native";
import { NativePlayer } from "@/lib/nativePlayer";
import { parseLocalIntent, runAction, type MatchCard, type Outcome } from "@/lib/lauraActions";
import { getKnownOnlineChannels, type Channel } from "@/services/channels";
import { askMovieAssistant, type LauraAction } from "@/services/gemini";
import { fetchMyList, fetchWatched } from "@/services/library";
import { listPublicRooms, type RoomRow } from "@/services/rooms";
import { posterUrl, tmdb } from "@/services/tmdb";

interface MovieMatch {
  id: number; type: "movie" | "tv"; name: string; poster: string | null; year: string; overview: string;
  voteAverage: number; voteCount: number; genre: string; duration: string;
}
type Msg =
  | { key: number; kind: "text"; who: "bot" | "user" | "loading" | "error"; text: string }
  | { key: number; kind: "movies"; items: MovieMatch[] }
  | { key: number; kind: "channels"; items: Channel[] }
  | { key: number; kind: "rooms"; items: RoomRow[] }
  | { key: number; kind: "done"; tone: "ok" | "warn"; text: string }
  | { key: number; kind: "chips"; items: string[] };

/** O que a Laura sabe fazer — cada item é um comando pronto: toque para executar. */
const CAPABILITIES: { icon: string; title: string; items: string[] }[] = [
  { icon: "▶️", title: "Reproduzir", items: ["Reproduzir Homem-Aranha: Um Novo Dia", "Continuar de onde parei", "Assistir The Boys temporada 2 episódio 3", "Abrir o canal Globo"] },
  { icon: "🔎", title: "Descobrir", items: ["Me surpreenda com um filme", "Filmes com Tom Holland", "Um suspense parecido com Se7en", "O que está passando na Globo agora?"] },
  { icon: "📌", title: "Sua lista", items: ["Adicionar Duna à minha lista", "Marcar Matrix como visto", "Dar amei para Interestelar", "Abrir minha lista"] },
  { icon: "👥", title: "Salas e amigos", items: ["Criar uma sala para assistir Oppenheimer", "Que salas estão abertas?", "Abrir meus amigos"] },
  { icon: "🎞️", title: "Mais", items: ["Mostrar o trailer de Duna", "Baixar Avatar", "Compartilhar Barbie", "Abrir os canais ao vivo"] },
];

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

function Orb({ size = "" }: { size?: string }) {
  return <span className={`lr-orb ${size}`} aria-hidden="true"><Icon name="sparkles" size={size === "big" ? 34 : 16} strokeWidth={2.2} /></span>;
}

function MovieCard({ m }: { m: MovieMatch }) {
  const [copied, setCopied] = useState(false);
  const meta = [m.year, m.genre, m.duration].filter(Boolean).join(" • ");

  async function share() {
    const url = `${window.location.origin}/details?id=${m.id}&type=${m.type}`;
    const r = await shareLink({ title: `${m.name} — ALXmovies`, url });
    if (r === "copied") { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  }

  return (
    <div className="ai-movie-card lr-card">
      <img src={posterUrl(m.poster, "w185")} alt={m.name} onError={imgFallback} />
      <div className="ai-mc-info">
        <div className="ai-mc-title">{m.name}</div>
        {meta && <div className="ai-mc-meta">{meta}</div>}
        {m.voteAverage > 0 && <div className="lr-rating">★ {m.voteAverage.toFixed(1)} <span>• {voteCountLabel(m.voteCount)} avaliações</span></div>}
        {m.overview && <div className="ai-mc-syn">{m.overview}</div>}
        <div className="ai-mc-btns">
          <Link className="ai-mc-btn ai-mc-watch" to={`/watch?id=${m.id}&type=${m.type}`}><Icon name="play" size={16} /> Assistir</Link>
          <Link className="ai-mc-btn ai-mc-share" to={`/details?id=${m.id}&type=${m.type}`}>Detalhes</Link>
          <button type="button" className={`ai-mc-btn ai-mc-share lr-share${copied ? " copiado" : ""}`} aria-label="Compartilhar" onClick={() => void share()}>
            {copied ? <Icon name="check" size={16} /> : <Icon name="share" size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Laura() {
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { openPlayer, openPanel } = useChannelsUi();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [listening, setListening] = useState(false);
  const nextKey = useRef(1);
  const convo = useRef<{ role: "user" | "laura"; text: string }[]>([]);
  const lastTitles = useRef<{ title: string; type: string }[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add("page-laura");
    return () => document.body.classList.remove("page-laura");
  }, []);
  useEffect(() => { const el = box.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [messages]);

  const push = (m: Omit<Msg, "key"> | Msg) => {
    const key = nextKey.current++;
    setMessages((cur) => [...cur, { ...m, key } as Msg]);
    return key;
  };
  const drop = (key: number) => setMessages((cur) => cur.filter((m) => m.key !== key));
  const remember = (role: "user" | "laura", text: string) => { convo.current = [...convo.current, { role, text: text.slice(0, 400) }].slice(-6); };
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/home", { replace: true }));

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

  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  /** Mostra o resultado de uma ação (cartão do título/canal + linha "feito") e, se for abrir algo, abre depois de a pessoa ler. */
  async function showOutcome(out: Outcome, withNav = true) {
    if (out.match) {
      const m: MatchCard = out.match;
      push({ kind: "movies", items: [{ id: m.id, type: m.type, name: m.name, poster: m.poster, year: m.year, overview: m.overview, voteAverage: m.voteAverage, voteCount: m.voteCount, genre: "", duration: "" }] });
    }
    if (out.channels?.length) push({ kind: "channels", items: out.channels });
    if (out.message) { push({ kind: "done", tone: out.tone ?? "ok", text: out.message }); remember("laura", out.message); }
    if (withNav && out.navigate) setTimeout(out.navigate, 1000);
  }

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy || !activeProfile) return;
    push({ kind: "text", who: "user", text: question });
    remember("user", question);
    setInput(""); setBusy(true);
    const ctx = { profile: activeProfile, navigate, openPlayer, openPanel };
    let loading = push({ kind: "text", who: "loading", text: "Pensando..." });
    try {
      // 1) comando direto ("reproduzir X", "abrir o canal Y"…): resolve na hora, sem esperar a IA
      const local = parseLocalIntent(question);
      if (local) {
        const out = await runAction(local, ctx).catch(() => ({ handled: false }) as Outcome);
        if (out.handled) { drop(loading); await showOutcome(out); return; }
      }

      // 2) conversa com a IA (que também pode pedir ações)
      const wantsChannels = /\bcanai?s?\b|\btv\s*(ao vivo|aberta)?\b|\bassistir ao vivo\b|\bpassando\b|\bao vivo\b/i.test(question);
      const onlineChannels = wantsChannels ? await getKnownOnlineChannels(20) : [];
      const wantsRooms = /\bsalas?\b|\bassistir\s+junt[oa]\b|\bwatch\s*party\b/i.test(question);
      const onlineRooms = wantsRooms ? await listPublicRooms().catch(() => [] as RoomRow[]) : [];

      const { reply, titles, channels, rooms, actions, suggestions } = await askMovieAssistant(question, {
        onlineChannels, watchHistory: await watchHistory().catch(() => []),
        onlineRooms: onlineRooms.map((r) => ({ title: r.title, movieTitle: r.movie_title, hostName: r.host_name, hasPassword: !!r.has_password })),
        history: convo.current.slice(0, -1), lastTitles: lastTitles.current,
      });
      drop(loading); loading = -1;
      push({ kind: "text", who: "bot", text: reply });
      remember("laura", reply);

      const actedOnTitle = actions.some((a) => "title" in a);
      if (titles.length && !actedOnTitle) {
        const searching = push({ kind: "text", who: "loading", text: "Procurando no catálogo..." });
        const matches = await findOnSite(titles);
        drop(searching);
        if (matches.length) { push({ kind: "movies", items: matches }); lastTitles.current = matches.map((m) => ({ title: m.name, type: m.type })); }
      }
      const chosenChannels = onlineChannels.filter((c) => channels.some((n) => n.toLowerCase() === (c.name || "").toLowerCase()));
      if (chosenChannels.length) push({ kind: "channels", items: chosenChannels });
      const chosenRooms = onlineRooms.filter((r) => rooms.some((n) => n.toLowerCase() === (r.title || "").toLowerCase()));
      if (chosenRooms.length) push({ kind: "rooms", items: chosenRooms });

      // ações pedidas: as que mudam dados rodam todas; só a primeira que abre uma tela é executada
      let nav: (() => void) | undefined;
      for (const a of actions as LauraAction[]) {
        const out = await runAction(a, ctx).catch((e) => ({ handled: true, tone: "warn", message: e instanceof Error ? `Não consegui: ${e.message}` : "Não consegui fazer isso agora." }) as Outcome);
        if (out.match?.name) lastTitles.current = [{ title: out.match.name, type: out.match.type }];
        await showOutcome(out, false);
        if (out.navigate && !nav) nav = out.navigate;
      }
      if (nav) setTimeout(nav, 1000);
      if (suggestions.length) push({ kind: "chips", items: suggestions });
    } catch (err) {
      if (loading !== -1) drop(loading);
      push({ kind: "text", who: "error", text: err instanceof Error ? err.message : "Não consegui responder agora. Tente de novo." });
    } finally {
      setBusy(false);
      if (!isNative) setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  /** Fala com a Laura: abre o reconhecimento de voz do Android. */
  async function listen() {
    if (busy || listening) return;
    setListening(true);
    try {
      const r = await NativePlayer.listen({ prompt: "Fale com a Laura" });
      if (r.text.trim()) void ask(r.text);
    } catch (e) {
      push({ kind: "text", who: "error", text: e instanceof Error ? e.message : "Reconhecimento de voz indisponível." });
    } finally { setListening(false); }
  }

  const first = (activeProfile?.name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="lr-screen">
      <header className="lr-head">
        <button type="button" className="lr-back" aria-label="Voltar" onClick={back}><Icon name="arrowLeft" /></button>
        <Orb />
        <div className="lr-title"><strong>Laura IA</strong><span><i /> Online</span></div>
        {messages.length > 0 && (
          <button type="button" className="lr-new" aria-label="Nova conversa" disabled={busy} onClick={() => { setMessages([]); convo.current = []; lastTitles.current = []; }}><Icon name="refresh" size={20} /></button>
        )}
      </header>

      <div className="lr-msgs" ref={box}>
        {messages.length === 0 && (
          <div className="lr-welcome">
            <Orb size="big" />
            <h1>Oi{first ? `, ${first}` : ""}! Eu sou a Laura</h1>
            <p>Eu abro filmes, séries e canais, crio salas, cuido da sua lista e indico o que assistir. Toque em um exemplo ou fale comigo.</p>
            <div className="lr-caps">
              {CAPABILITIES.map((g) => (
                <section key={g.title}>
                  <h3><span>{g.icon}</span>{g.title}</h3>
                  <div>
                    {g.items.map((t) => <button key={t} type="button" className="lr-chip" onClick={() => void ask(t)}><span>{t}</span></button>)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (m.kind === "text") {
            if (m.who === "user") return <div key={m.key} className="lr-row me"><div className="lr-bubble me"><AiText text={m.text} /></div></div>;
            if (m.who === "loading") return <div key={m.key} className="lr-row"><Orb /><div className="lr-bubble typing" aria-label={m.text}><i /><i /><i /></div></div>;
            return <div key={m.key} className="lr-row"><Orb /><div className={`lr-bubble${m.who === "error" ? " error" : ""}`}><AiText text={m.text} /></div></div>;
          }
          if (m.kind === "done") return <div key={m.key} className={`lr-done ${m.tone}`}><AiText text={m.text} /></div>;
          if (m.kind === "chips") return <div key={m.key} className="lr-chips">{m.items.map((t) => <button key={t} type="button" onClick={() => void ask(t)}>{t}</button>)}</div>;
          if (m.kind === "movies") return <div key={m.key} className="lr-results">{m.items.map((it) => <MovieCard key={`${it.type}-${it.id}`} m={it} />)}</div>;
          if (m.kind === "channels") {
            return (
              <div key={m.key} className="ai-results-row lr-strip">
                {m.items.map((c) => (
                  <button key={c.stream} type="button" className="ai-result-card ai-channel-card" onClick={() => openPlayer(c, m.items)}>
                    <img src={c.logo || "/assets/no-poster.png"} alt={c.name} onError={imgFallback} /><span>{c.name}</span>
                  </button>
                ))}
              </div>
            );
          }
          return (
            <div key={m.key} className="ai-results-row lr-strip">
              {m.items.map((r) => (
                <Link key={r.id} className="ai-result-card ai-room-card" to={`/sala?id=${r.id}`}>
                  <img src={r.poster_path ? posterUrl(r.poster_path, "w200") : "/assets/no-poster.png"} alt={r.title} onError={imgFallback} />
                  <span>{r.title}{r.has_password ? " 🔒" : ""}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      <form className="lr-form" onSubmit={submit}>
        <input ref={inputRef} type="text" enterKeyHint="send" placeholder="Peça um filme, um canal ou uma ação…" autoComplete="off" disabled={busy}
          value={input} onChange={(e) => setInput(e.target.value)} />
        {isNative && !input.trim() ? (
          <button type="button" className={`lr-mic${listening ? " on" : ""}`} disabled={busy} aria-label="Falar com a Laura" onClick={() => void listen()}><Icon name="mic" size={21} /></button>
        ) : (
          <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar"><Icon name="send" size={20} /></button>
        )}
      </form>
    </div>
  );
}
