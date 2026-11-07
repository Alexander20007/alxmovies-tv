import { MediaCard } from "./MediaCard";
import type { MediaItem, MediaType } from "@/types";

interface Props {
  title: string;
  items: MediaItem[];
  type?: MediaType;
  ranked?: boolean;
}

export function MediaRow({ title, items, type = "movie", ranked }: Props) {
  if (!items.length) return null;
  return (
    <section className="row">
      <div className="row-title">{title}</div>
      <div className="row-track">
        {items.map((m, i) => (
          <MediaCard
            key={m.id}
            id={m.id}
            type={(m.media_type === "tv" ? "tv" : type)}
            title={m.title ?? m.name}
            posterPath={m.poster_path}
            rank={ranked ? i + 1 : undefined}
            rating={m.vote_average}
          />
        ))}
      </div>
    </section>
  );
}
