import { useQuery } from "@tanstack/react-query";
import { tmdb, posterUrl } from "@/services/tmdb";

const COLS = 6;

/** Parede de pôsteres reais no fundo, em colunas que deslizam devagar em direções alternadas. */
export function AuthBackground() {
  const posters = useQuery({
    queryKey: ["auth-bg-posters"],
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const [trending, popular] = await Promise.all([tmdb.trending("movie", "week"), tmdb.popular("movie")]);
      return [...(trending.results ?? []), ...(popular.results ?? [])].filter((m) => m.poster_path).map((m) => m.poster_path as string);
    },
  });

  const list = posters.data ?? [];
  return (
    <>
      <div className="auth-bg-grid">
        {list.length > 0 && Array.from({ length: COLS }, (_, c) => {
          // intercala entre colunas para não repetir pôster; dobra a lista para o loop ficar contínuo
          const col: string[] = [];
          for (let i = c; i < list.length; i += COLS) col.push(list[i]);
          return (
            <div key={c} className={`auth-bg-col ${c % 2 === 0 ? "up" : "down"}`}>
              {[...col, ...col].map((path, i) => <img key={i} src={posterUrl(path, "w300")} loading="lazy" alt="" />)}
            </div>
          );
        })}
      </div>
      <div className="auth-bg-wash" />
    </>
  );
}
