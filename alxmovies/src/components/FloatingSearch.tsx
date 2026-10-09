import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useProfile } from "@/context/ProfileContext";
import { useDebounce } from "@/hooks/useDebounce";
import { filterForProfile } from "@/lib/contentFilter";
import { posterUrl, tmdb } from "@/services/tmdb";
import { useBackClose } from "@/hooks/useBackClose";

/** Busca que abre por cima da página atual (sem sair dela) ao tocar na lupa do topo. */
export function FloatingSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackClose(open, onClose);
  const { activeProfile } = useProfile();
  const { openPanel } = useChannelsUi();
  const [term, setTerm] = useState("");
  const query = useDebounce(term.trim(), 350);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const res = useQuery({ queryKey: ["floating-search", query], queryFn: () => tmdb.search(query, "multi"), enabled: open && !!query });
  const items = filterForProfile((res.data?.results ?? []).filter((r) => r.media_type !== "person" && r.poster_path), activeProfile).slice(0, 12);

  let body = null;
  if (query) {
    if (res.isFetching && !res.data) body = <p className="hsp-status">Buscando...</p>;
    else if (res.isError) body = <p className="hsp-status">Erro ao buscar. Tente de novo.</p>;
    else if (res.data && !items.length) body = <p className="hsp-status">Nenhum resultado pra "{query}".</p>;
    else if (items.length) {
      body = (
        <>
          <div className="hsp-grid">
            {items.map((item) => {
              const title = item.title ?? item.name ?? "";
              const type = item.media_type === "tv" ? "tv" : "movie";
              return (
                <Link key={`${type}-${item.id}`} className="hsp-card" to={`/details?id=${item.id}&type=${type}`} onClick={onClose}>
                  <img src={posterUrl(item.poster_path, "w200")} alt={title} loading="lazy" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
                  <span>{title}</span>
                </Link>
              );
            })}
          </div>
          <Link className="hsp-see-all" to={`/search?q=${encodeURIComponent(query)}`} onClick={onClose}>Ver todos os resultados e filtros →</Link>
        </>
      );
    }
  }

  return (
    <div className={`header-search-panel${open ? " open" : ""}`} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="hsp-box">
        <div className="hsp-input-row">
          <span className="hsp-ico">🔍</span>
          <input ref={inputRef} type="text" placeholder="Buscar filmes, séries..." autoComplete="off" value={term} onChange={(e) => setTerm(e.target.value)} />
          <button type="button" aria-label="Fechar busca" onClick={onClose}>✕</button>
        </div>
        <button type="button" className="hsp-chip" onClick={() => { onClose(); openPanel(); }}>📡 Ver canais ao vivo</button>
        <div className="hsp-results">{body}</div>
      </div>
    </div>
  );
}
