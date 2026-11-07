import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useBackClose } from "@/hooks/useBackClose";
import { openExternal } from "@/lib/native";

export interface TrailerVideo { key: string; site: string; type: string; official?: boolean; iso_639_1?: string }

/** Escolhe o melhor vídeo: trailer em português > trailer oficial > teaser. `null` se não houver nada no YouTube. */
export function pickTrailer(list: TrailerVideo[] | undefined): TrailerVideo | null {
  const yt = (list ?? []).filter((v) => v.site === "YouTube" && v.key);
  if (!yt.length) return null;
  const score = (v: TrailerVideo) =>
    (v.type === "Trailer" ? 30 : v.type === "Teaser" ? 20 : 10) + (v.iso_639_1 === "pt" ? 6 : v.iso_639_1 === "en" ? 2 : 0) + (v.official ? 1 : 0);
  return [...yt].sort((a, b) => score(b) - score(a))[0];
}

export function TrailerModal({ video, title, onClose }: { video: TrailerVideo | null; title: string; onClose: () => void }) {
  useBackClose(!!video, onClose);
  if (!video) return null;
  const src = `https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
  return createPortal(
    <div className="tr-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tr-card" role="dialog" aria-modal="true" aria-label={`Trailer de ${title}`}>
        <div className="tr-head">
          <div><small>Trailer</small><b>{title}</b></div>
          <button type="button" className="dl-x" onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} /></button>
        </div>
        <div className="tr-frame">
          <iframe src={src} title={`Trailer de ${title}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
        <button type="button" className="tr-ext" onClick={() => void openExternal(`https://www.youtube.com/watch?v=${video.key}`)}>
          Não carregou? Abrir no YouTube <Icon name="chevronRight" size={16} strokeWidth={2.6} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
