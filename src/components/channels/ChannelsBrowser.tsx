import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChannelCard } from "@/components/channels/ChannelCard";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useProfile } from "@/context/ProfileContext";
import { useChannelFavorites } from "@/hooks/useChannelFavorites";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getAvailableCategories, getChannelsInCategory, getChannelStatus, getFavoriteChannels, getKnownOfflineChannels, guessCategoryIcon,
  recheckChannel, runWithConcurrency, searchChannels, streamOnlineChannels, TEST_CONCURRENCY, type Category, type Channel,
} from "@/services/channels";

const titleCase = (s: string) => s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

type View = { k: "live" } | { k: "fav" } | { k: "cat"; cat: Category };
interface Tested { online: Channel[]; offline: Channel[]; tested: number; total: number; done: boolean; loading: boolean }
const EMPTY: Tested = { online: [], offline: [], tested: 0, total: 0, done: false, loading: true };

/** Carrega uma lista de canais e testa um a um (usa o último teste guardado quando é recente). "live" = os que estão no ar agora. */
function useTested(key: string, mode: "live" | "list", pid: string, load: () => Promise<Channel[]>): Tested {
  const [st, setSt] = useState<Tested>(EMPTY);
  useEffect(() => {
    let cancel = false;
    setSt(EMPTY);
    (async () => {
      if (mode === "live") {
        const on: Channel[] = [];
        await streamOnlineChannels(pid, (c) => { on.push(c); if (!cancel) setSt((s) => ({ ...s, online: [...on], loading: false })); },
          { maxToShow: 80, deadlineMs: 30000, isCancelled: () => cancel }).catch(() => {});
        const off = await getKnownOfflineChannels(40).catch(() => [] as Channel[]);
        if (!cancel) setSt((s) => ({ ...s, offline: off.filter((o) => !on.some((x) => x.stream === o.stream)), loading: false, done: true, tested: on.length + off.length, total: on.length + off.length }));
        return;
      }
      const list = (await load().catch(() => [] as Channel[])).filter((c) => c.stream);
      if (cancel) return;
      setSt((s) => ({ ...s, total: list.length, loading: false, done: !list.length }));
      const on: Channel[] = [], off: Channel[] = [];
      let n = 0;
      await runWithConcurrency(list, TEST_CONCURRENCY, async (c) => {
        const known = getChannelStatus(c.stream);
        const ok = known ? known.online : await recheckChannel(c.stream);
        if (cancel) return;
        n++; (ok ? on : off).push(c);
        setSt((s) => ({ ...s, online: [...on], offline: [...off], tested: n }));
      });
      if (!cancel) setSt((s) => ({ ...s, done: true }));
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pid]);
  return st;
}

function Results({ viewKey, mode, load, emptyText, showOffline }: { viewKey: string; mode: "live" | "list"; load: () => Promise<Channel[]>; emptyText: string; showOffline: boolean }) {
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const { closePanel } = useChannelsUi();
  const { isFavorite, toggle, busy } = useChannelFavorites();
  const st = useTested(viewKey, mode, activeProfile!.id, load);
  const items = [...st.online.map((c) => ({ c, online: true })), ...(showOffline ? st.offline.map((c) => ({ c, online: false })) : [])];
  const open = (c: Channel) => { closePanel(); navigate(`/canal?s=${encodeURIComponent(c.stream)}`, { state: { channel: c } }); };
  const pct = st.total ? Math.round((st.tested / st.total) * 100) : 0;

  return (
    <>
      <div className="cpx-count">
        <span className="cpx-live"><i />{st.online.length} no ar</span>
        {st.offline.length > 0 && <span className="cpx-off">{st.offline.length} offline</span>}
        {!st.done && <span className="cpx-prog"><Spinner size={13} /> {mode === "list" && st.total ? `Testando ${st.tested}/${st.total}` : "Procurando canais…"}</span>}
      </div>
      {!st.done && mode === "list" && st.total > 0 && <div className="cpx-bar"><i style={{ width: `${pct}%` }} /></div>}

      {st.loading && !items.length ? <div className="cpx-empty"><Spinner size={26} /><p>Carregando canais…</p></div>
        : !items.length ? <div className="cpx-empty">{st.done ? <><span>📡</span><p>{emptyText}</p></> : <><Spinner size={26} /><p>Procurando canais no ar…</p></>}</div>
        : (
          <div className="cpx-grid">
            {items.map(({ c, online }) => (
              <div key={c.stream} className="cpx-item">
                <ChannelCard channel={c} online={online} onClick={() => open(c)} />
                <button type="button" className={`cpx-fav${isFavorite(c.stream) ? " on" : ""}`} disabled={busy} aria-label="Favoritar"
                  onClick={() => toggle(c)}><Icon name="heart" size={17} fill={isFavorite(c.stream) ? "currentColor" : "none"} /></button>
              </div>
            ))}
          </div>
        )}
    </>
  );
}

/**
 * Canais ao vivo em tela cheia: busca, filtros (no ar agora · favoritos · categorias) e grade com selo AO VIVO / OFFLINE.
 * `inline` = usado dentro da página Buscar (sem cabeçalho próprio, a busca vem de fora).
 */
export function ChannelsBrowser({ externalSearch, onClearSearch, onClose, inline }: { externalSearch?: string; onClearSearch?: () => void; onClose?: () => void; inline?: boolean }) {
  const { activeProfile } = useProfile();
  const pid = activeProfile!.id;
  const [own, setOwn] = useState("");
  const text = (externalSearch ?? own).trim();
  const debounced = useDebounce(text, 400);
  const [view, setView] = useState<View>({ k: "live" });
  const [showOffline, setShowOffline] = useState(false);
  const chips = useRef<HTMLDivElement>(null);
  const cats = useQuery({ queryKey: ["channelCategories"], queryFn: getAvailableCategories, staleTime: Infinity });

  useEffect(() => { chips.current?.scrollTo({ left: 0 }); }, [debounced]);

  const label = view.k === "cat" ? (view.cat.name === null ? "Sem categoria" : titleCase(view.cat.name)) : view.k === "fav" ? "Favoritos" : "No ar agora";
  let body;
  if (debounced) {
    body = <Results key={`s:${debounced}`} viewKey={`s:${debounced}`} mode="list" showOffline={showOffline} load={() => searchChannels(debounced)} emptyText={`Nenhum canal encontrado para "${debounced}".`} />;
  } else if (view.k === "fav") {
    body = <Results key="fav" viewKey="fav" mode="list" showOffline={showOffline} load={() => getFavoriteChannels(pid)} emptyText="Você ainda não favoritou canais. Toque no coração de um canal para guardá-lo aqui." />;
  } else if (view.k === "cat") {
    const cat = view.cat;
    body = <Results key={`c:${cat.name}`} viewKey={`c:${cat.name}`} mode="list" showOffline={showOffline} load={() => getChannelsInCategory(cat.name)} emptyText="Nenhum canal encontrado nessa categoria." />;
  } else {
    body = <Results key="live" viewKey="live" mode="live" showOffline={showOffline} load={async () => []} emptyText="Nenhum canal no ar no momento." />;
  }

  return (
    <div className={`cpx-in${inline ? " inline" : ""}`}>
      {!inline && (
        <header className="cpx-head">
          <button type="button" className="dv-round" aria-label="Fechar" onClick={onClose}><Icon name="arrowLeft" size={22} strokeWidth={2.4} /></button>
          <div className="cpx-titles"><h1>Canais ao vivo</h1><small>{debounced ? `Busca: “${debounced}”` : label}</small></div>
        </header>
      )}

      {!inline && (
        <div className="sx-field cpx-search">
          <Icon name="search" size={20} />
          <input type="text" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Buscar canal…" />
          {own && <button type="button" aria-label="Limpar" onClick={() => { setOwn(""); onClearSearch?.(); }}><Icon name="close" size={18} /></button>}
        </div>
      )}

      {!debounced && (
        <div className="cpx-chips" ref={chips}>
          <button type="button" className={view.k === "live" ? "on" : ""} onClick={() => setView({ k: "live" })}>🔴 No ar agora</button>
          <button type="button" className={view.k === "fav" ? "on" : ""} onClick={() => setView({ k: "fav" })}>⭐ Favoritos</button>
          {(cats.data ?? []).map((cat) => (
            <button key={cat.name ?? "none"} type="button" className={view.k === "cat" && view.cat.name === cat.name ? "on" : ""} onClick={() => setView({ k: "cat", cat })}>
              {cat.name === null ? "🗂️" : guessCategoryIcon(cat.name)} {cat.name === null ? "Sem categoria" : titleCase(cat.name)} <i>{cat.count}</i>
            </button>
          ))}
        </div>
      )}

      <label className="cpx-switch">
        <input type="checkbox" checked={showOffline} onChange={(e) => setShowOffline(e.target.checked)} />
        <span className="cpx-sw" /> Mostrar também os offline
      </label>

      <div className="cpx-body">{body}</div>
    </div>
  );
}
