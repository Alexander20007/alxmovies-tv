import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { backdropUrl, tmdb } from "@/services/tmdb";
import type { MediaItem } from "@/types";
import "@/styles/home-v2.css";

const SLIDE_MS = 7000;
const SWIPE_PX = 48;
const MAX_SLIDES = 6;

/** Placeholder enquanto os destaques carregam. */
export function HeroSkeleton() {
  return <div className="hx-skel" aria-hidden="true" />;
}

/**
 * Destaques em carrossel: troca sozinho a cada 7s (barrinhas de progresso estilo "stories"),
 * pausa ao tocar/segurar, e dá pra arrastar de lado pra trocar.
 * O avanço automático é feito pelo fim da animação da barrinha — por isso pausar a barra pausa o tempo.
 */
export function HeroCarousel({ picks }: { picks: MediaItem[] }) {
  const navigate = useNavigate();
  const slides = useMemo(() => {
    const withBg = picks.filter((p) => p.backdrop_path);
    return (withBg.length ? withBg : picks).slice(0, MAX_SLIDES);
  }, [picks]);

  const genres = useQuery({ queryKey: ["genres", "movie"], queryFn: () => tmdb.genres("movie"), staleTime: Infinity });
  const genreName = useMemo(
    () => new Map((genres.data?.genres ?? []).map((g) => [g.id, g.name] as [number, string])),
    [genres.data],
  );

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const n = slides.length;
  if (!n) return null;

  const current = index % n;
  const pick = slides[current];
  const year = (pick.release_date ?? "").slice(0, 4);
  const rating = pick.vote_average ? pick.vote_average.toFixed(1) : null;
  const chips = (pick.genre_ids ?? []).map((id) => genreName.get(id)).filter((g): g is string => !!g).slice(0, 3);

  const next = () => setIndex((i) => (i + 1) % n);
  const prev = () => setIndex((i) => (i - 1 + n) % n);

  const onDown = (e: React.PointerEvent) => { startX.current = e.clientX; setPaused(true); };
  const onUp = (e: React.PointerEvent) => {
    const s = startX.current;
    startX.current = null;
    setPaused(e.pointerType === "mouse"); // mouse ainda está em cima: continua pausado
    if (s == null || n < 2) return;
    const dx = e.clientX - s;
    if (dx <= -SWIPE_PX) next();
    else if (dx >= SWIPE_PX) prev();
  };
  const onCancel = () => { startX.current = null; setPaused(false); };
  const onEnter = (e: React.PointerEvent) => { if (e.pointerType === "mouse") setPaused(true); };

  return (
    <section
      className={`hx-hero${paused ? " paused" : ""}`}
      aria-roledescription="carousel"
      aria-label="Destaques de hoje"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onPointerEnter={onEnter}
      onPointerLeave={onCancel}
    >
      <div className="hx-slides" aria-hidden="true">
        {slides.map((p, i) => (
          <div key={p.id} className={`hx-slide${i === current ? " active" : ""}`}>
            <img src={backdropUrl(p.backdrop_path) ?? "/assets/no-poster.png"} alt="" loading={i < 2 ? "eager" : "lazy"} draggable={false} />
          </div>
        ))}
      </div>

      <div className="hx-content" key={pick.id}>
        <span className="hx-tag">🔥 #{current + 1} em alta hoje</span>
        <h2 className="hx-title">{pick.title ?? pick.name}</h2>
        <div className="hx-meta">
          {year && <span>{year}</span>}
          {rating && <span className="hx-rating">★ {rating}</span>}
          {chips.map((c) => <span key={c} className="hx-chip">{c}</span>)}
        </div>
        {pick.overview && <p className="hx-overview">{pick.overview}</p>}
        <div className="hx-actions">
          <button type="button" className="hx-btn primary" onClick={() => navigate(`/watch?id=${pick.id}&type=movie`)}>
            <Icon name="play" size={20} /> Assistir
          </button>
          <button type="button" className="hx-btn ghost" onClick={() => navigate(`/details?id=${pick.id}&type=movie`)}>
            <Icon name="info" size={20} /> Detalhes
          </button>
        </div>
      </div>

      {n > 1 && (
        <div className="hx-segs">
          {slides.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`hx-seg${i < current ? " done" : ""}${i === current ? " active" : ""}`}
              aria-label={`Destaque ${i + 1} de ${n}`}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="hx-seg-bar">
                {i === current && (
                  <i
                    className="hx-seg-fill"
                    style={{ animationDuration: `${SLIDE_MS}ms` }}
                    onAnimationEnd={(e) => { if (e.target === e.currentTarget) next(); }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
