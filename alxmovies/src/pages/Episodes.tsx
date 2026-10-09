import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { SeasonModal } from "@/components/SeasonModal";
import { useGuardedMedia } from "@/hooks/useGuardedMedia";
import {
  ensureSeason, formatDateBR, getLastEpisode, getSeasonsList, pickStartEpisode, seasonLabel, todayISO, type EpisodeInfo,
} from "@/lib/media";
import { backdropUrl, posterUrl } from "@/services/tmdb";

const PlayIcon = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
);

interface CardProps { ep: EpisodeInfo; index: number; isLast: boolean; today: string; onPlay: () => void }

function EpisodeCard({ ep, index, isLast, today, onPlay }: CardProps) {
  const [open, setOpen] = useState(false);
  const soon = !!ep.airDate && ep.airDate > today;
  const meta = soon ? `Estreia em ${formatDateBR(ep.airDate)}` : ep.runtime ? `${ep.runtime} min` : formatDateBR(ep.airDate);
  const overview = ep.overview || "Sinopse não disponível para este episódio.";

  return (
    <article className={`ex-ep ${isLast ? "playing" : ""} ${soon ? "soon" : ""}`} style={{ "--i": Math.min(index, 12) } as CSSProperties}>
      {soon ? (
        <div className="ex-thumb">
        <img loading="lazy" src={ep.still ? posterUrl(ep.still, "w300") : "/assets/no-poster.png"} alt=""
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
        {soon ? <span className="ex-lock">Em breve</span> : <span className="ex-play"><PlayIcon /></span>}
        {isLast && <span className="ex-resume">Continuar</span>}
        </div>
      ) : (
        <button type="button" className="ex-thumb" aria-label={`Assistir episódio ${ep.number}`} onClick={onPlay}>
        <img loading="lazy" src={ep.still ? posterUrl(ep.still, "w300") : "/assets/no-poster.png"} alt=""
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
        {soon ? <span className="ex-lock">Em breve</span> : <span className="ex-play"><PlayIcon /></span>}
        {isLast && <span className="ex-resume">Continuar</span>}
        </button>
      )}
      <div className="ex-body">
        <div className="ex-top" onClick={soon ? undefined : onPlay}>
          <span className="ex-num">{ep.number}</span>
          <h3>{ep.name || `Episódio ${ep.number}`}</h3>
          <span className="ex-meta">{meta}</span>
        </div>
        <p className={`ex-over ${open ? "" : "clamped"}`}>{overview}</p>
        {(ep.overview ?? "").length > 120 && (
          <button type="button" className="dx-more ex-more" onClick={() => setOpen((o) => !o)}>{open ? "Ver menos" : "Ver mais"}</button>
        )}
      </div>
    </article>
  );
}

export default function Episodes() {
  const [params, setParams] = useSearchParams();
  const id = Number(params.get("id"));
  const navigate = useNavigate();
  const { media, loading, error, blocked, profile } = useGuardedMedia("tv", id);
  const pid = profile!.id;
  const [modal, setModal] = useState(false);

  const seasons = useMemo(() => (media ? getSeasonsList(media) : []), [media]);
  const last = getLastEpisode(pid, id);
  const qs = Number(params.get("s"));
  const firstSeason = seasons[0]?.season_number ?? 1;
  const viewSeason = seasons.some((s) => s.season_number === qs) ? qs
    : last && seasons.some((s) => s.season_number === last.season) ? last.season : firstSeason;

  const eps = useQuery({
    queryKey: ["season", id, viewSeason],
    queryFn: () => ensureSeason(id, viewSeason),
    enabled: !!media && !blocked,
  });

  const back = `/details?id=${id}&type=tv`;
  const play = (season: number, episode: number) => navigate(`/watch?id=${id}&type=tv&s=${season}&e=${episode}`);

  if (!id) return <ImmersivePage back="/home"><SubEmpty title="Título inválido" text="Não encontramos esta série." to="/home" /></ImmersivePage>;
  if (loading) return <ImmersivePage back={back}><SubSkeleton /></ImmersivePage>;
  if (error || !media) return <ImmersivePage back={back}><SubEmpty title="Não foi possível carregar os episódios" text="Tente voltar e clicar novamente." /></ImmersivePage>;
  if (blocked) {
    return (
      <ImmersivePage back="/home">
        <SubEmpty title="🔒 Conteúdo bloqueado" to="/profiles" label="Trocar de perfil"
          text={`Este título não está disponível para o perfil "${profile?.name ?? ""}" por causa da classificação indicativa configurada.`} />
      </ImmersivePage>
    );
  }

  const title = media.name ?? media.title ?? "";
  const start = pickStartEpisode(media, pid, id, params);
  const bg = media.backdrop_path ? backdropUrl(media.backdrop_path, "w1280") : posterUrl(media.poster_path, "w500");
  const today = todayISO();

  return (
    <ImmersivePage back={back} id="ep-page">
      <div className="ex-hero">
        <div className="ex-hero-bg"><img src={bg ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
        <div className="ex-hero-inner">
          <small className="ex-kicker">Episódios</small>
          <h1>{title}</h1>
          <div className="ex-hero-actions">
            <button type="button" className="dx-play" onClick={() => play(start.season, start.episode)}>
              <PlayIcon /> {last ? "Continuar" : "Assistir"} T{start.season}:E{start.episode}
            </button>
            <button type="button" className="dx-ghost" onClick={() => setModal(true)}>{seasonLabel(viewSeason)} ▾</button>
          </div>
        </div>
      </div>

      <div className="ex-list-head">
        <h2>{seasonLabel(viewSeason)}</h2>
        <span>{eps.data?.length ? `${eps.data.length} episódio${eps.data.length > 1 ? "s" : ""}` : ""}</span>
      </div>

      <div className="d2-ep-list ex-list">
        {eps.isLoading && Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="ex-ep ex-skel"><div className="ex-thumb sk" /><div className="ex-body"><i className="sk sk-line" /><i className="sk sk-line short" /></div></div>
        ))}
        {eps.isError && <div className="d2-ep-status">Não foi possível carregar os episódios.</div>}
        {eps.data && !eps.data.length && <div className="d2-ep-status">Nenhum episódio disponível.</div>}
        {eps.data?.map((ep, i) => (
          <EpisodeCard key={ep.number} ep={ep} index={i} today={today}
            isLast={!!last && last.season === viewSeason && last.episode === ep.number}
            onPlay={() => play(viewSeason, ep.number)} />
        ))}
      </div>

      {modal && (
        <SeasonModal seasons={seasons} current={viewSeason} onClose={() => setModal(false)}
          onPick={(n) => { setModal(false); setParams({ id: String(id), type: "tv", s: String(n) }, { replace: true }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}
    </ImmersivePage>
  );
}
