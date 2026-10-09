import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdBlock } from "@/components/Ads";
import { Hero } from "@/components/Hero";
import { MediaRow } from "@/components/MediaRow";
import { MediaCard } from "@/components/MediaCard";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useProfile } from "@/context/ProfileContext";
import { filterForProfile } from "@/lib/contentFilter";
import { isBirthdayToday } from "@/lib/birthday";
import { fetchAllChannels, streamOnlineChannels, type Channel } from "@/services/channels";
import { tmdb } from "@/services/tmdb";
import { fetchContinueWatching, fetchMyList, fetchWatched } from "@/services/library";
import type { HistoryItem, MediaItem, MediaType } from "@/types";



function HistoryRow({ title, items, to }: { title: string; items: HistoryItem[]; to: "watch" | "details" }) {
  if (!items.length) return null;
  return (
    <section className="row">
      <div className="row-title">{title}</div>
      <div className="row-track">
        {items.map((i) => (
          <MediaCard key={i.id} id={i.media_id} type={i.media_type} title={i.title} posterPath={i.poster_path}
            progress={to === "watch" ? i.progress : undefined} to={to} />
        ))}
      </div>
    </section>
  );
}



const FIVE_MIN = 5 * 60_000;
const KIDS_GENRES = [16, 10751]; // animação e família

/** Fileira que busca os próprios dados e aplica o filtro de classificação do perfil. */
function QueryRow({ title, queryKey, fn, ranked, type = "movie" }: {
  title: string; queryKey: unknown[]; fn: () => Promise<{ results: MediaItem[] }>; ranked?: boolean; type?: MediaType;
}) {
  const { activeProfile } = useProfile();
  const q = useQuery({ queryKey, queryFn: fn, staleTime: FIVE_MIN });
  return <MediaRow title={title} items={filterForProfile(q.data?.results ?? [], activeProfile)} ranked={ranked} type={type} />;
}

/** "Porque você assistiu X": usa o último título concluído (ou, sem histórico, um favorito) como base. */
function BecauseYouWatchedRow({ profileId }: { profileId: string }) {
  const { activeProfile } = useProfile();
  const source = useQuery({
    queryKey: ["recSource", profileId],
    queryFn: async () => {
      const watched = await fetchWatched(profileId, 5).catch(() => []);
      if (watched.length) return watched[0];
      const favs = await fetchMyList(profileId).catch(() => []);
      return favs[0] ?? null;
    },
    staleTime: FIVE_MIN,
  });
  const src = source.data;
  const recs = useQuery({
    queryKey: ["recs", src?.media_type, src?.media_id],
    queryFn: () => tmdb.recommendations(src!.media_type, src!.media_id),
    enabled: !!src, staleTime: FIVE_MIN,
  });
  if (!src) return null;
  return <MediaRow title={`Porque você assistiu "${src.title || "esse título"}"`} items={filterForProfile(recs.data?.results ?? [], activeProfile)} type={src.media_type} />;
}

/** Aniversário: usa os próprios favoritos do perfil (funciona pra qualquer um, sem configurar nada). */
function BirthdayRow({ profileId }: { profileId: string }) {
  const { activeProfile } = useProfile();
  const favs = useQuery({ queryKey: ["mylist", profileId], queryFn: () => fetchMyList(profileId) });
  const items: MediaItem[] = (favs.data ?? []).map((f) => ({
    id: f.media_id, media_type: f.media_type, title: f.title, name: f.title, poster_path: f.poster_path, backdrop_path: null,
  }));
  return <MediaRow title="Escolhidos especialmente pra você 💛" items={filterForProfile(items, activeProfile)} />;
}

/** Até 4 fileiras de gênero: os favoritos do perfil primeiro; no perfil infantil, só gêneros seguros. */
function GenreRows() {
  const { activeProfile } = useProfile();
  const genres = useQuery({ queryKey: ["genres", "movie"], queryFn: () => tmdb.genres("movie"), staleTime: Infinity });
  const list = genres.data?.genres ?? [];
  const pool = activeProfile?.is_kids ? list.filter((g) => KIDS_GENRES.includes(g.id)) : list;
  const fav = Array.isArray(activeProfile?.favorite_genres) ? activeProfile!.favorite_genres! : [];
  const featured = [...pool.filter((g) => fav.includes(g.id)), ...pool.filter((g) => !fav.includes(g.id))].slice(0, 4);
  return (
    <>
      {featured.map((g) => (
        <QueryRow key={g.id} title={g.name} queryKey={["genre", g.id]} fn={() => tmdb.byGenre("movie", g.id)} />
      ))}
    </>
  );
}

/** Fileira "Canais ao vivo": testa o catálogo e vai mostrando os que estão no ar (favoritos primeiro). */
function ChannelsRow({ profileId }: { profileId: string }) {
  const { openPlayer, openPanel } = useChannelsUi();
  const [list, setList] = useState<Channel[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const found: Channel[] = [];
    setList([]); setDone(false);
    streamOnlineChannels(profileId, (c) => { found.push(c); if (!cancelled) setList([...found]); },
      { maxToShow: 20, deadlineMs: 20000, isCancelled: () => cancelled })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDone(true); });
    return () => { cancelled = true; };
  }, [profileId]);

  return (
    <section className="row">
      <div className="row-title">📡 Canais ao vivo</div>
      <div className="row-track">
        {!list.length && <div className="channel-status-card">{done ? "Nenhum canal online no momento." : "Procurando canais online..."}</div>}
        {list.map((c) => (
          <div key={c.stream} className="media-card channel-media-card" onClick={() => openPlayer(c, list)}>
            <img src={c.logo || "/assets/no-poster.png"} alt={c.name || ""} loading="lazy" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
            <span className="channel-media-card-name">{c.name || "Canal"}</span>
          </div>
        ))}
        {done && list.length > 0 && (
          <div className="media-card channel-see-all-card" onClick={openPanel}><span>📡</span><span>Ver todos<br />os canais</span></div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const { activeProfile } = useProfile();
  const pid = activeProfile!.id;
  const q = { staleTime: 5 * 60_000 };

  const daily = useQuery({ queryKey: ["trending", "day"], queryFn: () => tmdb.trending("movie", "day"), ...q });
  const continueW = useQuery({ queryKey: ["continue", pid], queryFn: () => fetchContinueWatching(pid) });
  const watched = useQuery({ queryKey: ["watched", pid], queryFn: () => fetchWatched(pid) });

  // Link de canal compartilhado (?openChannel=...) abre o player direto
  const [search, setSearch] = useSearchParams();
  const { openPlayer } = useChannelsUi();
  useEffect(() => {
    const stream = search.get("openChannel");
    if (!stream) return;
    void fetchAllChannels().then((all) => {
      const match = all.find((c) => c.stream === stream);
      if (match) openPlayer(match, [match]);
      const next = new URLSearchParams(search);
      next.delete("openChannel");
      setSearch(next, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hero = useMemo(() => {
    const allowed = filterForProfile(daily.data?.results ?? [], activeProfile);
    return allowed[Math.floor(Math.random() * Math.min(5, allowed.length))];
  }, [daily.data, activeProfile]);

  return (
    <>
      {hero && <Hero pick={hero} />}
      <main id="rows-container">
        <HistoryRow title="Continuar assistindo" items={continueW.data ?? []} to="watch" />
        <HistoryRow title="Assistidos recentemente" items={watched.data ?? []} to="details" />
        <BecauseYouWatchedRow profileId={pid} />
        {isBirthdayToday(activeProfile) && <BirthdayRow profileId={pid} />}
        <QueryRow title="Em alta esta semana" queryKey={["trending", "week"]} fn={() => tmdb.trending("movie", "week")} ranked />
        <AdBlock />
        <QueryRow title="Populares" queryKey={["popular"]} fn={() => tmdb.popular("movie")} />
        <GenreRows />
        {!activeProfile?.is_kids && <ChannelsRow profileId={pid} />}
      </main>
    </>
  );
}
