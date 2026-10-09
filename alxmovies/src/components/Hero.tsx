import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { backdropUrl } from "@/services/tmdb";
import type { MediaItem } from "@/types";

export function Hero({ pick }: { pick: MediaItem }) {
  const navigate = useNavigate();
  const year = (pick.release_date ?? "").slice(0, 4);
  const rating = pick.vote_average ? pick.vote_average.toFixed(1) : null;
  const bg = useMemo(() => backdropUrl(pick.backdrop_path), [pick.backdrop_path]);

  return (
    <div className="hero" style={bg ? { backgroundImage: `url(${bg})` } : undefined}>
      <div className="hero-content">
        <span className="hero-tag">🔥 Em alta hoje</span>
        <h2>{pick.title}</h2>
        <div className="hero-meta">
          {year && <span>{year}</span>}
          {rating && <span className="hero-meta-rating">★ {rating}</span>}
        </div>
        <p>{pick.overview}</p>
        <div className="hero-actions">
          <button className="hero-btn primary" onClick={() => navigate(`/watch?id=${pick.id}&type=movie`)}>▶ Assistir agora</button>
          <button className="hero-btn secondary" onClick={() => navigate(`/details?id=${pick.id}&type=movie`)}>ℹ Mais informações</button>
        </div>
      </div>
    </div>
  );
}
