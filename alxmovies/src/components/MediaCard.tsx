import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { rowPosterSize } from "@/lib/preferences";
import { posterUrl } from "@/services/tmdb";
import type { MediaType } from "@/types";

interface Props {
  id: number;
  type: MediaType;
  title?: string;
  posterPath: string | null;
  progress?: number | null;
  to?: "details" | "watch";
  rank?: number;
  rating?: number | null;
}

const fallback = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; };

export const MediaCard = memo(function MediaCard({ id, type, title, posterPath, progress, to = "details", rank, rating }: Props) {
  const navigate = useNavigate();
  const nota = rating ? rating.toFixed(1) : null;
  const img = <img src={posterUrl(posterPath, rowPosterSize())} alt={title ?? ""} loading="lazy" onError={fallback} />;

  return (
    <div className={`media-card${rank != null ? " ranked" : ""}`} onClick={() => navigate(`/${to}?id=${id}&type=${type}`)}>
      {rank != null ? (
        <>
          <span className="rank-number">{rank}</span>
          <div className="rank-poster">{img}{nota && <span className="card-rating">★ {nota}</span>}</div>
        </>
      ) : (
        <>
          {img}
          {nota && <span className="card-rating">★ {nota}</span>}
        </>
      )}
      {progress != null && (
        <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
      )}
    </div>
  );
});
