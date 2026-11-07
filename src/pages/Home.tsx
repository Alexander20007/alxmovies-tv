import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdBlock } from "@/components/Ads";
import { HeroCarousel } from "@/components/HeroCarousel";
import { Icon, type IconName } from "@/components/Icon";
import { ChannelCard } from "@/components/channels/ChannelCard";
import { MediaRow } from "@/components/MediaRow";
import { MediaCard } from "@/components/MediaCard";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useProfile } from "@/context/ProfileContext";
import { filterForProfile } from "@/lib/contentFilter";
import { isBirthdayToday } from "@/lib/birthday";
import { fetchAllChannels, getKnownOfflineChannels, streamOnlineChannels, type Channel } from "@/services/channels";
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
function QueryRow({ title, queryKey, fn, ranked, limit, type = "movie" }: {
  title: string; queryKey: unknown[]; fn: () => Promise<{ results: MediaItem[] }>; ranked?: boolean; limit?: number; type?: MediaType;
}) {
  const { activeProfile } = useProfile();
  const q = useQuery({ queryKey, queryFn: fn, staleTime: FIVE_MIN });
  const items = filterForProfile(q.data?.results ?? [], activeProfile);
  return <MediaRow title={title} items={limit ? items.slice(0, limit) : items} ranked={ranked} type={type} />;
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

/** Fileira "Canais ao vivo": cartões do tamanho dos pôsteres, com selo AO VIVO / OFFLINE; tocar abre a página do canal. */
function ChannelsRow({ profileId }: { profileId: string }) {
  const { openPanel } = useChannelsUi();
  const navigate = useNavigate();
  const [items, setItems] = useState<{ c: Channel; online: boolean }[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const found: { c: Channel; online: boolean }[] = [];
    setItems([]); setDone(false);
    streamOnlineChannels(profileId, (c) => { found.push({ c, online: true }); if (!cancelled) setItems([...found]); },
      { maxToShow: 20, deadlineMs: 20000, isCancelled: () => cancelled })
      .catch(() => {})
      .then(() => getKnownOfflineChannels(6).catch(() => [] as Channel[]))
      .then((off) => {
        if (cancelled) return;
        const have = new Set(found.map((f) => f.c.stream));
        off.filter((c) => !have.has(c.stream)).forEach((c) => found.push({ c, online: false }));
        setItems([...found]);
      })
      .finally(() => { if (!cancelled) setDone(true); });
    return () => { cancelled = true; };
  }, [profileId]);

  const list = items.map((i) => i.c);
  return (
    <section className="row">
      <div className="row-title">📡 Canais ao vivo</div>
      <div className="row-track">
        {!items.length && <div className="channel-status-card">{done ? "Nenhum canal online no momento." : "Procurando canais online..."}</div>}
        {items.map(({ c, online }) => (
          <ChannelCard key={c.stream} channel={c} online={online}
            onClick={() => navigate(`/canal?s=${encodeURIComponent(c.stream)}`, { state: { channel: c, list } })} />
        ))}
        {done && items.length > 0 && (
          <button type="button" className="cc cc-all" onClick={openPanel}><span>📡</span><b>Ver todos<br />os canais</b></button>
        )}
      </div>
    </section>
  );
}

/** Atalhos logo abaixo do destaque: salas, amigos, minha lista e canais ao vivo. */
function QuickChips({ kids }: { kids: boolean }) {
  const navigate = useNavigate();
  const { openPanel } = useChannelsUi();
  const chips: { icon: IconName; label: string; go: () => void }[] = [
    { icon: "film", label: "Salas", go: () => navigate("/salas") },
    { icon: "users", label: "Amigos", go: () => navigate("/amigos") },
    { icon: "bookmark", label: "Minha lista", go: () => navigate("/mylist") },
    ...(!kids ? [{ icon: "tv" as IconName, label: "Canais ao vivo", go: openPanel }] : []),
  ];
  return (
    <nav className="hx-chips" aria-label="Atalhos">
      {chips.map((c) => (
        <button key={c.label} type="button" className="hx-chip" onClick={c.go}>
          <Icon name={c.icon} size={18} /> {c.label}
        </button>
      ))}
    </nav>
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

  const heroes = useMemo(
    () => filterForProfile(daily.data?.results ?? [], activeProfile).filter((m) => m.backdrop_path).slice(0, 8),
    [daily.data, activeProfile],
  );

  return (
    <>
      {heroes.length > 0 && <HeroCarousel items={heroes} />}
      <QuickChips kids={!!activeProfile?.is_kids} />
      <main id="rows-container" className="home-v2">
        <HistoryRow title="Continuar assistindo" items={continueW.data ?? []} to="watch" />
        <HistoryRow title="Assistidos recentemente" items={watched.data ?? []} to="details" />
        <BecauseYouWatchedRow profileId={pid} />
        {isBirthdayToday(activeProfile) && <BirthdayRow profileId={pid} />}
        <QueryRow title="🏆 Top 10 da semana" queryKey={["trending", "week"]} fn={() => tmdb.trending("movie", "week")} ranked limit={10} />
        <AdBlock />
        <QueryRow title="Populares" queryKey={["popular"]} fn={() => tmdb.popular("movie")} />
        <GenreRows />
        {!activeProfile?.is_kids && <ChannelsRow profileId={pid} />}
      </main>
    </>
  );
}
