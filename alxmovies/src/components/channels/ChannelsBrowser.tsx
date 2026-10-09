import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useChannelFavorites } from "@/hooks/useChannelFavorites";
import { useDebounce } from "@/hooks/useDebounce";
import {
  channelGroupLabel, getAvailableCategories, getChannelsInCategory, guessCategoryIcon, runWithConcurrency, searchChannels,
  testChannelOnline, TEST_CONCURRENCY, type Category, type Channel,
} from "@/services/channels";

const titleCase = (s: string) => s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

function ChannelGrid({ list }: { list: Channel[] }) {
  const { openPlayer } = useChannelsUi();
  const { isFavorite, toggle, busy } = useChannelFavorites();
  if (!list.length) return <p className="channels-panel-empty">Nenhum canal online encontrado ainda.</p>;
  return (
    <div className="channels-panel-grid">
      {list.map((c) => (
        <div key={c.stream} className="channel-card-wrap">
          <button type="button" className="channel-card" onClick={() => openPlayer(c, list)}>
            <img alt="" src={c.logo || "/assets/no-poster.png"} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
            <span className="channel-card-name">{c.name || "Canal"}</span>
            <span className="channel-card-group">{channelGroupLabel(c.group)}</span>
          </button>
          <button type="button" className={`channel-fav-btn channel-fav-btn-corner${isFavorite(c.stream) ? " active" : ""}`} disabled={busy} aria-label="Favoritar"
            onClick={(e) => { e.stopPropagation(); toggle(c); }}>{isFavorite(c.stream) ? "♥" : "♡"}</button>
        </div>
      ))}
    </div>
  );
}

/** Testa os canais e vai revelando só os que estão no ar. */
function OnlineChannels({ channels, emptyText }: { channels: Channel[]; emptyText: string }) {
  const [shown, setShown] = useState<Channel[]>([]);
  const [tested, setTested] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setShown([]); setTested(0); setDone(false);
    const found: Channel[] = [];
    let count = 0;
    void runWithConcurrency(channels.filter((c) => c.stream), TEST_CONCURRENCY, async (c) => {
      const online = await testChannelOnline(c.stream);
      if (cancelled) return;
      count++; setTested(count);
      if (online) { found.push(c); setShown([...found]); }
    }).then(() => { if (!cancelled) setDone(true); });
    return () => { cancelled = true; };
  }, [channels]);

  if (!channels.length) return <p className="channels-panel-status">{emptyText}</p>;
  return (
    <>
      <p className="channels-panel-status">
        {done ? `✅ ${shown.length} canal(is) online.` : `Testado ${tested}/${channels.length} — ${shown.length} online até agora...`}
      </p>
      <ChannelGrid list={shown} />
    </>
  );
}

function GroupView({ cat, onBack }: { cat: Category; onBack: () => void }) {
  const label = cat.name === null ? "Sem categoria" : titleCase(cat.name);
  const list = useQuery({ queryKey: ["channelsIn", cat.name], queryFn: () => getChannelsInCategory(cat.name), staleTime: Infinity });
  return (
    <>
      <button type="button" className="channels-back-btn" onClick={onBack}>← Voltar às categorias</button>
      <h3 className="channels-group-title">{guessCategoryIcon(cat.name || "")} {label}</h3>
      {list.isLoading ? <p className="channels-panel-status">Procurando canais online...</p>
        : <OnlineChannels channels={list.data ?? []} emptyText="Nenhum canal encontrado nessa categoria." />}
    </>
  );
}

function SearchView({ text, onBack }: { text: string; onBack: () => void }) {
  const res = useQuery({ queryKey: ["channelSearch", text], queryFn: () => searchChannels(text), staleTime: 60_000 });
  return (
    <>
      <button type="button" className="channels-back-btn" onClick={onBack}>← Voltar às categorias</button>
      {res.isLoading ? <p className="channels-panel-status">Buscando "{text}"...</p>
        : <OnlineChannels channels={res.data ?? []} emptyText={`Nenhum canal encontrado pra "${text}".`} />}
    </>
  );
}

/** Navegação de canais: categorias → canais do grupo, ou busca. Pode usar um campo de busca externo. */
export function ChannelsBrowser({ externalSearch, onClearSearch }: { externalSearch?: string; onClearSearch?: () => void }) {
  const [own, setOwn] = useState("");
  const text = (externalSearch ?? own).trim();
  const debounced = useDebounce(text, 400);
  const [group, setGroup] = useState<Category | null>(null);
  const prevText = useRef("");

  useEffect(() => { if (debounced && debounced !== prevText.current) setGroup(null); prevText.current = debounced; }, [debounced]);

  const cats = useQuery({ queryKey: ["channelCategories"], queryFn: getAvailableCategories, staleTime: Infinity });
  const clearSearch = () => { setOwn(""); onClearSearch?.(); };

  let body;
  if (debounced) body = <SearchView text={debounced} onBack={clearSearch} />;
  else if (group) body = <GroupView cat={group} onBack={() => setGroup(null)} />;
  else if (cats.isLoading) body = <p className="channels-panel-status">Carregando categorias...</p>;
  else if (!cats.data?.length) body = <p className="channels-panel-status">Não foi possível carregar as categorias agora.</p>;
  else {
    body = (
      <div className="channel-groups-grid">
        {cats.data.map((cat) => (
          <button key={cat.name ?? "none"} type="button" className="channel-group-card" onClick={() => setGroup(cat)}>
            <span className="channel-group-icon">{cat.name === null ? "🗂️" : guessCategoryIcon(cat.name)}</span>
            <span className="channel-group-name">{cat.name === null ? "Sem categoria" : titleCase(cat.name)}</span>
            <span className="channel-group-count">{cat.count} canal{cat.count === 1 ? "" : "is"}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      {externalSearch === undefined && (
        <div className="channels-panel-search">
          <input type="text" className="cb-search" placeholder="🔍 Buscar canal..." value={own} onChange={(e) => setOwn(e.target.value)} />
        </div>
      )}
      <div className="channels-browser-body cb-body">{body}</div>
    </>
  );
}
