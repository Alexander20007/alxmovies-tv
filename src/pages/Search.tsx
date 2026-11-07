import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChannelsBrowser } from "@/components/channels/ChannelsBrowser";
import { Icon } from "@/components/Icon";
import { MediaCard } from "@/components/MediaCard";
import { Spinner } from "@/components/Spinner";
import { useProfile } from "@/context/ProfileContext";
import { useDebounce } from "@/hooks/useDebounce";
import { filterForProfile } from "@/lib/contentFilter";
import { tmdb } from "@/services/tmdb";
import type { MediaItem, MediaType } from "@/types";

type TypeFilter = "" | "movie" | "tv" | "channels";
const TYPES: { id: TypeFilter; label: string }[] = [
  { id: "", label: "✨ Tudo" }, { id: "movie", label: "🎬 Filmes" }, { id: "tv", label: "📺 Séries" }, { id: "channels", label: "📡 Canais" },
];
const RECENT_KEY = "alx.recent.searches";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } };
const writeRecent = (l: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(l.slice(0, 8))); } catch { /* sem armazenamento */ } };

export default function Search() {
  const { activeProfile } = useProfile();
  const [params] = useSearchParams();
  const initialType = ([ "movie", "tv", "channels" ].includes(params.get("type") ?? "") ? params.get("type") : "") as TypeFilter;
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [type, setType] = useState<TypeFilter>(initialType);
  const [genre, setGenre] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const query = useDebounce(term.trim(), 400);
  const isChannels = type === "channels";

  useEffect(() => { setGenre(""); }, [type]); // gêneros de filme e série são listas diferentes

  const movieGenres = useQuery({ queryKey: ["genres", "movie"], queryFn: () => tmdb.genres("movie"), staleTime: Infinity });
  const tvGenres = useQuery({ queryKey: ["genres", "tv"], queryFn: () => tmdb.genres("tv"), staleTime: Infinity });
  const genreList = (type === "tv" ? tvGenres.data : movieGenres.data)?.genres ?? [];

  const searching = !isChannels && !!(query || genre);
  const results = useQuery({
    queryKey: ["search-page", query, type, genre],
    enabled: !isChannels,
    queryFn: async (): Promise<MediaItem[]> => {
      const mediaType = (type || "") as MediaType | "";
      if (query) {
        const data = await tmdb.search(query, mediaType || "multi");
        let list = data.results.filter((r) => r.media_type !== "person");
        if (genre) list = list.filter((r) => r.genre_ids?.includes(Number(genre)));
        return list;
      }
      if (genre) return (await tmdb.byGenre((mediaType || "movie") as MediaType, Number(genre))).results;
      return (await tmdb.popular((mediaType || "movie") as MediaType)).results; // sem busca: populares
    },
  });

  const items = useMemo(
    () => filterForProfile(results.data ?? [], activeProfile).filter((i) => i.poster_path),
    [results.data, activeProfile],
  );

  const remember = (t: string) => {
    const v = t.trim();
    if (v.length < 2) return;
    const next = [v, ...readRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())];
    writeRecent(next); setRecent(next.slice(0, 8));
  };
  const clearRecent = () => { writeRecent([]); setRecent([]); };
  const genreName = genreList.find((g) => String(g.id) === genre)?.name;
  const heading = query ? `Resultados para “${query}”` : genre ? genreName ?? "Gênero" : type === "tv" ? "Séries populares" : type === "movie" ? "Filmes populares" : "Populares agora";

  return (
    <div className="sx">
      <div className="sx-field">
        <Icon name="search" size={21} />
        <input type="search" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} enterKeyHint="search"
          onKeyDown={(e) => { if (e.key === "Enter") { remember(term); (e.target as HTMLInputElement).blur(); } }}
          placeholder={isChannels ? "Buscar canal…" : "Filmes, séries, atores…"} />
        {term && <button type="button" aria-label="Limpar" onClick={() => setTerm("")}><Icon name="close" size={18} /></button>}
      </div>

      <div className="sx-chips" role="tablist" aria-label="Tipo">
        {TYPES.map((t) => (
          <button key={t.id || "all"} type="button" role="tab" aria-selected={type === t.id} className={type === t.id ? "on" : ""} onClick={() => setType(t.id)}>{t.label}</button>
        ))}
      </div>

      {!isChannels && genreList.length > 0 && (
        <div className="sx-chips sx-genres" aria-label="Gênero">
          <button type="button" className={!genre ? "on" : ""} onClick={() => setGenre("")}>Todos os gêneros</button>
          {genreList.map((g) => <button key={g.id} type="button" className={genre === String(g.id) ? "on" : ""} onClick={() => setGenre(String(g.id))}>{g.name}</button>)}
        </div>
      )}

      {isChannels ? (
        <ChannelsBrowser inline externalSearch={term} onClearSearch={() => setTerm("")} />
      ) : (
        <>
          {!term && !genre && recent.length > 0 && (
            <section className="sx-recent">
              <div><b>Buscas recentes</b><button type="button" onClick={clearRecent}>Limpar</button></div>
              <div className="sx-recent-list">{recent.map((r) => <button key={r} type="button" onClick={() => setTerm(r)}><Icon name="clock" size={15} /> {r}</button>)}</div>
            </section>
          )}

          <div className="sx-head">
            <h2>{heading}</h2>
            {results.isSuccess && <small>{items.length} {items.length === 1 ? "título" : "títulos"}</small>}
          </div>

          {results.isLoading && <div className="sx-state"><Spinner size={28} /><p>Buscando…</p></div>}
          {results.isError && <div className="sx-state"><span>⚠️</span><p>Erro ao buscar. Tente novamente.</p></div>}
          {results.isSuccess && !items.length && (
            <div className="sx-state"><span>🔍</span><p>{searching ? "Nenhum resultado encontrado." : "Nada por aqui."}</p><small>Tente outro nome ou outro gênero.</small></div>
          )}
          <div className="sx-grid" onClick={() => remember(term)}>
            {items.map((m) => (
              <MediaCard key={`${m.media_type ?? type}-${m.id}`} id={m.id}
                type={(m.media_type === "tv" || (!m.media_type && (type === "tv" || (!m.title && m.name)))) ? "tv" : "movie"}
                title={m.title ?? m.name} posterPath={m.poster_path} rating={m.vote_average} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
