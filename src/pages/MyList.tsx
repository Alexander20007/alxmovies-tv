import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MediaCard } from "@/components/MediaCard";
import { useProfile } from "@/context/ProfileContext";
import { getAchievements, getGenreStats } from "@/services/achievements";
import { fetchContinueWatching, fetchMyList, fetchWatched } from "@/services/library";

type Tab = "favorites" | "watching" | "watched";
const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: "favorites", label: "Favoritos", empty: 'Sua lista de favoritos está vazia. Adicione filmes e séries clicando em "+ Minha lista" nos detalhes.' },
  { id: "watching", label: "Continuar assistindo", empty: "Você ainda não começou a assistir nada." },
  { id: "watched", label: "Já assistidos", empty: "Nenhum título totalmente assistido ainda." },
];

function Achievements({ profileId }: { profileId: string }) {
  const [more, setMore] = useState(false);
  const badges = useQuery({ queryKey: ["achievements", profileId], queryFn: () => getAchievements(profileId), staleTime: 5 * 60_000 });
  const genres = useQuery({ queryKey: ["genreStats", profileId], queryFn: () => getGenreStats(profileId), enabled: more, staleTime: 5 * 60_000 });
  const stats = genres.data ?? [];
  const max = stats[0]?.count ?? 1;

  return (
    <div className="achievements-panel">
      <div className="achievements-header">
        <h2>🏆 Suas conquistas</h2>
        <button type="button" className="achievements-toggle" onClick={() => setMore((m) => !m)}>{more ? "Ver menos ▴" : "Ver mais ▾"}</button>
      </div>
      <div className="achievements-badges">
        {badges.isLoading && <p className="account-note">Carregando...</p>}
        {badges.isError && <p className="account-note">Não foi possível carregar as conquistas agora.</p>}
        {badges.data && !badges.data.length && <p className="account-note">Assista ou favorite alguns títulos pra desbloquear conquistas.</p>}
        {badges.data?.map((b) => (
          <div key={b.label} className="achievement-badge">
            <span className="achievement-icon">{b.icon}</span>
            <span className="achievement-label">{b.label}</span>
            <span className="achievement-detail">{b.detail}</span>
          </div>
        ))}
      </div>
      {more && (
        <div className="achievements-genres" style={{ display: "block" }}>
          {genres.isLoading && <p className="account-note">Calculando seus gêneros favoritos...</p>}
          {genres.isError && <p className="account-note">Não foi possível calcular agora.</p>}
          {genres.data && !stats.length && <p className="account-note">Sem dados suficientes ainda pra calcular seus gêneros favoritos.</p>}
          {stats.slice(0, 8).map((g) => (
            <div key={g.name} className="genre-stat-row">
              <span className="genre-stat-name">{g.name}</span>
              <div className="genre-stat-bar-wrap"><div className="genre-stat-bar" style={{ width: `${Math.round((g.count / max) * 100)}%` }} /></div>
              <span className="genre-stat-count">{g.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyList() {
  const { activeProfile } = useProfile();
  const pid = activeProfile!.id;
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "favorites") as Tab;

  const favorites = useQuery({ queryKey: ["mylist", pid], queryFn: () => fetchMyList(pid), enabled: tab === "favorites" });
  const watching = useQuery({ queryKey: ["continue", pid], queryFn: () => fetchContinueWatching(pid), enabled: tab === "watching" });
  const watched = useQuery({ queryKey: ["watched", pid], queryFn: () => fetchWatched(pid, 50), enabled: tab === "watched" });
  const q = tab === "favorites" ? favorites : tab === "watching" ? watching : watched;
  const items = (q.data ?? []) as { id: string; media_id: number; media_type: "movie" | "tv"; title?: string; poster_path: string | null }[];

  return (
    <>
      <div className="search-header">
        <h1>Minha Lista</h1>
        <div className="mylist-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`mylist-tab${t.id === tab ? " active" : ""}`}
              onClick={() => setParams(t.id === "favorites" ? {} : { tab: t.id }, { replace: true })}>{t.label}</button>
          ))}
        </div>
      </div>

      <Achievements profileId={pid} />

      <div className="search-results-grid">
        {q.isLoading && <p className="search-empty">Carregando...</p>}
        {q.isError && <p className="search-empty">Erro ao carregar: {(q.error as Error).message}</p>}
        {q.data && !items.length && <p className="search-empty">{TABS.find((t) => t.id === tab)!.empty}</p>}
        {items.map((f) => <MediaCard key={f.id} id={f.media_id} type={f.media_type} title={f.title} posterPath={f.poster_path} />)}
      </div>
    </>
  );
}
