import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChannelsBrowser } from "@/components/channels/ChannelsBrowser";
import { MediaCard } from "@/components/MediaCard";
import { useProfile } from "@/context/ProfileContext";
import { useDebounce } from "@/hooks/useDebounce";
import { filterForProfile } from "@/lib/contentFilter";
import { tmdb } from "@/services/tmdb";
import type { MediaItem, MediaType } from "@/types";

type TypeFilter = "" | "movie" | "tv" | "channels";

export default function Search() {
  const { activeProfile } = useProfile();
  const [params] = useSearchParams();
  const initialType = (["movie", "tv", "channels"].includes(params.get("type") ?? "") ? params.get("type") : "") as TypeFilter;
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [type, setType] = useState<TypeFilter>(initialType);
  const [genre, setGenre] = useState("");
  const query = useDebounce(term.trim(), 400);
  const isChannels = type === "channels";

  useEffect(() => { setGenre(""); }, [type]); // gêneros de filme e série são listas diferentes

  const movieGenres = useQuery({ queryKey: ["genres", "movie"], queryFn: () => tmdb.genres("movie"), staleTime: Infinity });
  const tvGenres = useQuery({ queryKey: ["genres", "tv"], queryFn: () => tmdb.genres("tv"), staleTime: Infinity });
  const genreList = (type === "tv" ? tvGenres.data : movieGenres.data)?.genres ?? [];

  const enabled = !isChannels && !!(query || genre || type);
  const results = useQuery({
    queryKey: ["search-page", query, type, genre],
    enabled,
    queryFn: async (): Promise<MediaItem[]> => {
      const mediaType = (type || "") as MediaType | "";
      if (query) {
        const data = await tmdb.search(query, mediaType || "multi");
        let list = data.results.filter((r) => r.media_type !== "person");
        if (genre) list = list.filter((r) => r.genre_ids?.includes(Number(genre)));
        return list;
      }
      if (genre) return (await tmdb.byGenre((mediaType || "movie") as MediaType, Number(genre))).results;
      return (await tmdb.popular(mediaType as MediaType)).results;
    },
  });

  const items = useMemo(
    () => filterForProfile(results.data ?? [], activeProfile).filter((i) => i.poster_path),
    [results.data, activeProfile]
  );

  return (
    <>
      <div className="search-header">
        <h1>Buscar filmes e séries</h1>
        <div className="filters-bar">
          <input type="text" id="search-page-input" autoFocus value={term} onChange={(e) => setTerm(e.target.value)}
            placeholder={isChannels ? "🔍 Buscar canal..." : "Digite um título..."}
            style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 5, border: "1px solid #444", background: "#1c1c22", color: "#f2f2f2" }} />
          <select id="type-filter" value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
            <option value="">Filmes e séries</option>
            <option value="movie">Somente filmes</option>
            <option value="tv">Somente séries</option>
            <option value="channels">📡 Canais</option>
          </select>
          {!isChannels && (
            <select id="genre-filter" value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Todos os gêneros</option>
              {genreList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {isChannels ? (
        <div className="channels-panel-body" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)", padding: "0 20px" }}>
          <ChannelsBrowser externalSearch={term} onClearSearch={() => setTerm("")} />
        </div>
      ) : (
        <div className="search-results-grid">
          {!enabled && <p className="search-empty">Digite algo ou escolha um gênero para buscar.</p>}
          {enabled && results.isError && <p className="search-empty">Erro ao buscar. Tente novamente.</p>}
          {enabled && results.isSuccess && !items.length && <p className="search-empty">Nenhum resultado encontrado.</p>}
          {items.map((m) => (
            <MediaCard key={`${m.media_type ?? type}-${m.id}`} id={m.id} type={(m.media_type === "tv" || (!m.media_type && (type === "tv" || (!m.title && m.name)))) ? "tv" : "movie"}
              title={m.title ?? m.name} posterPath={m.poster_path} />
          ))}
        </div>
      )}
    </>
  );
}
