import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { backdropUrl, tmdb } from "@/services/tmdb";
import type { MediaItem } from "@/types";
import "@/styles/home-v2.css";

const INTERVAL = 6500;

/**
 * Destaques da Home: troca sozinho deslizando (e dá para arrastar com o dedo).
 * Cada destaque mostra posição no ranking, título, ano • nota • gêneros e os botões Assistir / Detalhes.
 * Tocar no resto do cartaz abre os detalhes.
 */
export function HeroCarousel({ items }: { items: MediaItem[] }) {
  const navigate = useNavigate();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedUntil = useRef(0);

  const genres = useQuery({ queryKey: ["genres", "movie"], queryFn: () => tmdb.genres("movie"), staleTime: Infinity });
  const genreName = useMemo(
    () => new Map((genres.data?.genres ?? []).map((g) => [g.id, g.name] as [number, string])),
    [genres.data],
  );

  const goTo = useCallback((i: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // atualiza a bolinha conforme desliza
  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== indexRef.current) { indexRef.current = i; setIndex(i); }
  };

  // passa sozinho; se a pessoa mexer, espera um pouco antes de voltar a passar
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      if (document.visibilityState === "hidden" || Date.now() < pausedUntil.current) return;
      goTo((indexRef.current + 1) % items.length);
    }, INTERVAL);
    return () => clearInterval(t);
  }, [items.length, goTo]);

  const pause = () => { pausedUntil.current = Date.now() + 9000; };

  return (
    <section className="hc" aria-roledescription="carrossel" aria-label="Destaques">
      <div ref={track} className="hc-track" onScroll={onScroll} onPointerDown={pause} onTouchStart={pause}>
        {items.map((m, i) => {
          const title = m.title ?? m.name ?? "";
          const bg = backdropUrl(m.backdrop_path, "w1280");
          const year = (m.release_date ?? "").slice(0, 4);
          const rating = m.vote_average ? m.vote_average.toFixed(1) : null;
          const tags = (m.genre_ids ?? []).map((id) => genreName.get(id)).filter((g): g is string => !!g).slice(0, 3);
          return (
            <div key={m.id} className={`hc-slide${i === index ? " on" : ""}`} onClick={() => navigate(`/details?id=${m.id}&type=movie`)} role="group" aria-label={`${i + 1} de ${items.length}`}>
              {bg && <img src={bg} alt="" draggable={false} loading={i === 0 ? "eager" : "lazy"} />}
              <div className="hc-shade" />
              <div className="hc-info">
                <span className="hc-tag"><Icon name="trending" size={17} strokeWidth={2.6} /> #{i + 1} em alta hoje</span>
                <h2>{title}</h2>
                {(year || rating || tags.length > 0) && (
                  <div className="hx2-meta">
                    {year && <span>{year}</span>}
                    {rating && <span className="r">★ {rating}</span>}
                    {tags.length > 0 && <span>{tags.join(" · ")}</span>}
                  </div>
                )}
                <div className="hx2-actions">
                  <button type="button" className="hx2-btn play" aria-label={`Assistir ${title}`}
                    onClick={(e) => { e.stopPropagation(); navigate(`/watch?id=${m.id}&type=movie`); }}>
                    <Icon name="play" size={22} fill="currentColor" /> Assistir
                  </button>
                  <button type="button" className="hx2-btn info" aria-label={`Detalhes de ${title}`}
                    onClick={(e) => { e.stopPropagation(); navigate(`/details?id=${m.id}&type=movie`); }}>
                    <Icon name="info" size={22} /> Detalhes
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {items.length > 1 && (
        <div className="hc-dots" role="tablist" aria-label="Escolher destaque">
          {items.map((m, i) => (
            <button key={m.id} type="button" role="tab" aria-selected={i === index} aria-label={`Destaque ${i + 1}`}
              className={i === index ? "on" : ""} onClick={() => { pause(); goTo(i); }} />
          ))}
        </div>
      )}
    </section>
  );
}
