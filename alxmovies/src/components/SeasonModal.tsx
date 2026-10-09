import { useEffect } from "react";
import { seasonLabel } from "@/lib/media";
import { useBackClose } from "@/hooks/useBackClose";

interface Props { seasons: { season_number: number }[]; current: number; onPick: (n: number) => void; onClose: () => void }

export function SeasonModal({ seasons, current, onPick, onClose }: Props) {
  useBackClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="d2-modal show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="d2-modal-box" role="dialog" aria-modal="true" aria-label="Escolher temporada">
        <div className="d2-modal-head">
          <div><h2>Temporada</h2><small>Toque numa opção pra ver os episódios</small></div>
          <button type="button" className="d2-modal-close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        <div className="season-modal-list">
          {seasons.map((s) => (
            <div key={s.season_number} className={`d2-season-row ${s.season_number === current ? "active" : ""}`}
              onClick={() => onPick(s.season_number)}>
              <span>{seasonLabel(s.season_number)}</span>
              <div className="d2-season-dot" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
