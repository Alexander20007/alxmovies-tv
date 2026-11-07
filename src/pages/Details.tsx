import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CommentSheet, CommentsSection } from "@/components/details/Comments";
import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { SeasonModal } from "@/components/SeasonModal";
import { useGuardedMedia } from "@/hooks/useGuardedMedia";
import { useBackClose } from "@/hooks/useBackClose";
import { useMediaParams } from "@/hooks/useQueryParams";
import { getLastEpisode, getSeasonsList, lsGet, pickStartEpisode, seasonLabel, storageKey } from "@/lib/media";
import { getCertification } from "@/lib/certification";
import { addFavorite, isFavorite, removeFavorite } from "@/services/library";
import { addComment, getRating, getRatingSummary, setRating, type RatingValue } from "@/services/social";
import { backdropUrl, posterUrl, tmdb } from "@/services/tmdb";
import { isMovieWatched, setMovieWatched } from "@/services/seen";
import { isNative, shareLink } from "@/lib/native";
import { openCastSettings } from "@/lib/downloader";
import { Icon } from "@/components/Icon";
import { DetailTabs } from "@/components/DetailTabs";
import { TrailerModal, pickTrailer } from "@/components/TrailerModal";
import { MediaRow } from "@/components/MediaRow";
import { filterForProfile } from "@/lib/contentFilter";
import { DownloadSheet, type DownloadRequest } from "@/components/DownloadSheet";
import { useAdsEnabled } from "@/hooks/useAdsEnabled";
import { maybeShowInterstitial } from "@/lib/ads";

const RATINGS: { value: RatingValue; icon: string; title: string; hint: string }[] = [
  { value: "disliked", icon: "👎", title: "Não gostei", hint: "Não curti este título" },
  { value: "liked", icon: "👍", title: "Gostei", hint: "Foi legal" },
  { value: "loved", icon: "❤️", title: "Amei", hint: "Um dos meus favoritos" },
];

function Synopsis({ text, fallback }: { text: string; fallback: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(true);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && clamped) setOverflow(el.scrollHeight > el.clientHeight + 2);
  }, [text, clamped]);

  return (
    <section className="dv-card dv-synopsis">
      <p ref={ref} className={clamped ? "clamped" : ""}>{text}</p>
      {(overflow || !clamped) && (
        <button type="button" className="dv-more" onClick={() => setClamped((c) => !c)}>{clamped ? "Mostrar mais" : "Mostrar menos"}</button>
      )}
      {fallback && <small className="dv-note">Sinopse disponível apenas em inglês.</small>}
    </section>
  );
}

/** Folha "Avaliar": três opções grandes, a escolhida fica marcada. */
function RateSheet({ open, current, summary, onPick, onClose }: {
  open: boolean; current?: RatingValue | null; summary?: { liked: number; loved: number; disliked: number };
  onPick: (v: RatingValue) => void; onClose: () => void;
}) {
  useBackClose(open, onClose);
  if (!open) return null;
  const total = summary ? summary.liked + summary.loved + summary.disliked : 0;
  return createPortal(
    <div className="dv-sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dv-sheet" role="dialog" aria-modal="true" aria-label="Avaliar">
        <div className="dv-sheet-grip" />
        <h2>O que você achou?</h2>
        <div className="dv-rate-opts">
          {RATINGS.map((r) => (
            <button key={r.value} type="button" className={`dv-rate-opt${current === r.value ? " on" : ""}`} onClick={() => { onPick(r.value); onClose(); }}>
              <span className="e">{r.icon}</span><b>{r.title}</b><small>{r.hint}</small>
            </button>
          ))}
        </div>
        <p className="dv-sheet-sum">
          {summary && (total === 0 ? "Ainda sem avaliações de outros usuários." : <>👍 {summary.liked} &nbsp; ❤️ {summary.loved} &nbsp; 👎 {summary.disliked}</>)}
        </p>
      </div>
    </div>,
    document.body,
  );
}

export default function Details() {
  const { id, type } = useMediaParams();
  const isTv = type === "tv";
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { media, loading, error, blocked, profile } = useGuardedMedia(type, id);
  const pid = profile!.id;
  // anúncio de tela cheia ALEATÓRIO (30 %) ao abrir um título; só plano Grátis, com intervalo mínimo entre anúncios
  const adsOn = useAdsEnabled();
  useEffect(() => { if (adsOn) void maybeShowInterstitial(0.3); }, [adsOn, id]);

  const [seasonModal, setSeasonModal] = useState(false);
  const [dl, setDl] = useState<DownloadRequest | null>(null);
  const [sheet, setSheet] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [pop, setPop] = useState(false);
  const [copied, setCopied] = useState(false);

  const fav = useQuery({ queryKey: ["fav", pid, type, id], queryFn: () => isFavorite(pid, id, type), enabled: !!media && !blocked });
  const myRating = useQuery({ queryKey: ["rating", pid, type, id], queryFn: () => getRating(pid, id, type), enabled: !!media && !blocked });
  const summary = useQuery({ queryKey: ["ratingSummary", type, id], queryFn: () => getRatingSummary(id, type), enabled: !!media && !blocked });

  const videos = useQuery({ queryKey: ["videos", type, id], queryFn: () => tmdb.videos(type, id), enabled: !!media && !blocked, staleTime: 30 * 60_000 });
  const trailer = pickTrailer(videos.data?.results);
  // links da Laura IA: ?trailer=1 abre o trailer e ?download=1 abre as opções de download
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || !media || blocked) return;
    if (params.get("trailer") === "1" && trailer) { autoDone.current = true; setTrailerOpen(true); }
    else if (params.get("download") === "1" && isNative) { autoDone.current = true; setDl({ type, id, title: media.title ?? media.name ?? "", poster: posterUrl(media.poster_path ?? null, "w185") }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, blocked, trailer]);
  const watched = useQuery({ queryKey: ["watchedMovie", pid, id], queryFn: () => isMovieWatched(pid, id), enabled: !!media && !blocked && !isTv });

  const toggleWatched = useMutation({
    mutationFn: (seen: boolean) => setMovieWatched(pid, { media_id: id, title: media?.title ?? media?.name ?? "", poster_path: media?.poster_path ?? null }, seen),
    onMutate: async (seen) => { qc.setQueryData(["watchedMovie", pid, id], seen); },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(pid) }),
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["watchedMovie", pid, id] });
      alert("Não foi possível salvar agora: " + (e instanceof Error ? e.message : "tente de novo"));
    },
  });

  const toggleFav = useMutation({
    mutationFn: async () => {
      if (fav.data) await removeFavorite(pid, id, type);
      else await addFavorite(pid, type, media as any);
    },
    onSuccess: async () => {
      setPop(true); setTimeout(() => setPop(false), 400);
      await Promise.all([qc.invalidateQueries({ queryKey: ["fav", pid, type, id] }), qc.invalidateQueries({ queryKey: ["mylist", pid] })]);
    },
    onError: (e) => alert("Não foi possível atualizar sua lista: " + (e instanceof Error ? e.message : "tente de novo")),
  });

  const rate = useMutation({
    mutationFn: (r: RatingValue) => setRating(pid, id, type, media?.title ?? media?.name ?? "", r),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["rating", pid, type, id] }),
      qc.invalidateQueries({ queryKey: ["ratingSummary", type, id] }),
    ]),
  });

  const comment = useMutation({
    mutationFn: (body: string) => addComment(pid, id, type, body),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["comments", type, id] }), qc.invalidateQueries({ queryKey: ["commentLikes"] })]);
      setTimeout(() => document.getElementById("comments-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    },
  });

  if (!id) return <ImmersivePage back="/home"><SubEmpty title="Título inválido" text="Não encontramos este título." to="/home" /></ImmersivePage>;
  if (loading) return <ImmersivePage back="/home"><SubSkeleton /></ImmersivePage>;
  if (error || !media) {
    return <ImmersivePage back="/home"><SubEmpty title="Não foi possível carregar este título" text="Falha ao falar com o servidor. Se continuar, abra Minha conta › Diagnóstico de conexão." to="/diagnostico" label="Testar conexão" /></ImmersivePage>;
  }
  if (blocked) {
    return (
      <ImmersivePage back="/home">
        <SubEmpty title="🔒 Conteúdo bloqueado" to="/profiles" label="Trocar de perfil"
          text={`Este título não está disponível para o perfil "${profile?.name ?? ""}" por causa da classificação indicativa configurada.`} />
      </ImmersivePage>
    );
  }

  const m = media as any;
  const title: string = m.title ?? m.name;
  const releaseDate: string = m.release_date ?? m.first_air_date ?? "";
  const year = releaseDate.slice(0, 4);
  const runtime = m.runtime ? `${m.runtime} min` : m.episode_run_time?.[0] ? `${m.episode_run_time[0]} min/ep` : "";
  const rating = m.vote_average ? m.vote_average.toFixed(1) : null;
  const cert = getCertification(m, type);
  const heroImg = m.backdrop_path ? backdropUrl(m.backdrop_path, "w1280") : posterUrl(m.poster_path, "w500");
  const start = isTv ? pickStartEpisode(m, pid, id, params) : null;
  const viewSeason = start?.season ?? 1;
  const last = isTv ? getLastEpisode(pid, id) : null;
  const resumeMovie = !isTv && Number(lsGet(storageKey("resume", pid, type, id))) > 5;

  document.title = `${title} | ALXmovies`;

  const play = () =>
    navigate(isTv && start ? `/watch?id=${id}&type=tv&s=${start.season}&e=${start.episode}` : `/watch?id=${id}&type=movie`);

  async function share() {
    const url = `${window.location.origin}/details?id=${id}&type=${type}`;
    const r = await shareLink({ title: `${title} — ALXmovies`, url });
    if (r === "copied") { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  const playLabel = isTv ? (last ? `Continuar T${start!.season}:E${start!.episode}` : "Começar do início") : resumeMovie ? "Continuar" : "Assistir";
  const similar = filterForProfile(m.similar?.results ?? [], profile).slice(0, 14);
  const sum = summary.data;
  const mine = RATINGS.find((r) => r.value === myRating.data);

  return (
    <ImmersivePage back="/home" bar={false}>
      <div className="dv">
        <header className={`dv-hero${trailer ? " has-trailer" : ""}`}>
          <div className="dv-bg"><img src={heroImg ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
          <div className="dv-top">
            <Link className="dv-round" to="/home" aria-label="Voltar"><Icon name="arrowLeft" size={22} strokeWidth={2.4} /></Link>
            <span className="dv-top-sp" />
            <button type="button" className="dv-round" aria-label="Assistir em sala" title="Sala"
              onClick={() => navigate(`/salas?${new URLSearchParams({ tmdbId: String(id), mediaType: type, title, poster: m.poster_path || "" })}`)}>
              <Icon name="users" size={21} />
            </button>
            <button type="button" className={`dv-round dv-heart${fav.data ? " on" : ""}${pop ? " pop" : ""}`} disabled={toggleFav.isPending || fav.isLoading}
              aria-label={fav.data ? "Remover da minha lista" : "Adicionar à minha lista"} onClick={() => toggleFav.mutate()}>
              <Icon name="heart" size={22} fill={fav.data ? "currentColor" : "none"} />
            </button>
          </div>
          <div className="dv-poster">
            <img src={posterUrl(m.poster_path, "w500")} alt={title} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
            {trailer && (
              <button type="button" className="dv-trailer" onClick={() => setTrailerOpen(true)} aria-label={`Ver trailer de ${title}`}>
                <span className="dv-trailer-ic"><Icon name="play" size={15} /></span>Trailer
              </button>
            )}
            {cert && <span className={`dv-cert c${cert}`} aria-label={`Classificação indicativa: ${cert === "L" ? "livre" : cert + " anos"}`}>{cert}</span>}
          </div>
        </header>

        <h1 className="dv-title">{title}</h1>
        <div className="dv-meta">
          {rating && <span className="dv-rate">★ {rating}</span>}
          {year && <span>{year}</span>}
          {runtime && <span>{runtime}</span>}
          {isTv && <span>Série</span>}
        </div>
        {m.genres?.length > 0 && <div className="dv-genres">{m.genres.slice(0, 4).map((g: any) => <span key={g.id}>{g.name}</span>)}</div>}

        <div className="dv-actions">
          <button type="button" className="dv-btn dv-primary" onClick={play}>
            <Icon name="play" size={22} />{playLabel}
          </button>

          {isTv ? (
            <div className="dv-row">
              <button type="button" className="dv-btn" onClick={() => setSeasonModal(true)}>
                <span>{seasonLabel(viewSeason)}</span><Icon name="chevronDown" size={18} />
              </button>
              <button type="button" className="dv-btn dv-solid" onClick={() => navigate(`/episodes?id=${id}&s=${viewSeason}`)}>
                <span>Ver Episódios</span><Icon name="chevronRight" size={18} strokeWidth={2.6} />
              </button>
            </div>
          ) : isNative ? (
            <div className="dv-row">
              <button type="button" className="dv-btn" onClick={() => setDl({ type, id, title, poster: posterUrl(m.poster_path ?? null, "w185") })}><Icon name="download" size={20} /><span>Baixar</span></button>
              <button type="button" className="dv-btn" onClick={() => void openCastSettings()}><Icon name="cast" size={20} /><span>Espelhar</span></button>
            </div>
          ) : null}

          <div className="dv-row">
            <button type="button" className={`dv-btn${mine ? " rated" : ""}`} onClick={() => setRateOpen(true)}>
              {mine ? <span className="dv-emoji">{mine.icon}</span> : <Icon name="star" size={20} />}<span>{mine ? mine.title : "Avaliar"}</span>
            </button>
            <button type="button" className="dv-btn" onClick={() => void share()}>
              <Icon name="share" size={20} /><span>{copied ? "Copiado!" : "Compartilhar"}</span>
            </button>
          </div>

          {!isTv && (
            <button type="button" className={`dv-btn dv-seen${watched.data ? " on" : ""}`} disabled={toggleWatched.isPending || watched.isLoading}
              onClick={() => toggleWatched.mutate(!watched.data)}>
              <Icon name={watched.data ? "check" : "eye"} size={20} strokeWidth={watched.data ? 3 : 2} />
              <span>{watched.data ? "Visto · toque para desmarcar" : "Marcar como visto"}</span>
            </button>
          )}
        </div>

        <DetailTabs id={id} type={type} active="overview" />

        <Synopsis text={m.overview || "Sinopse não disponível para este título."} fallback={!!m._overviewFallback} />

        {similar.length > 0 && <div className="dv-similar"><MediaRow title="Títulos parecidos" items={similar} type={type} /></div>}

        <div className="dv-section-head">
          <div><h2>Comentários</h2><small>{sum && sum.liked + sum.loved + sum.disliked > 0 ? <>👍 {sum.liked} &nbsp;❤️ {sum.loved} &nbsp;👎 {sum.disliked}</> : "Notas e opiniões de quem já assistiu"}</small></div>
          <button type="button" className="dv-chip-btn" onClick={() => setSheet(true)}><Icon name="chat" size={16} /> Comentar</button>
        </div>
        <div className="dv-comments"><CommentsSection type={type} id={id} profileId={pid} /></div>
      </div>

      <RateSheet open={rateOpen} current={myRating.data as RatingValue | undefined} summary={sum} onPick={(v) => rate.mutate(v)} onClose={() => setRateOpen(false)} />
      <TrailerModal video={trailerOpen ? trailer : null} title={title} onClose={() => setTrailerOpen(false)} />
      <CommentSheet open={sheet} onClose={() => setSheet(false)} onSubmit={(b) => comment.mutateAsync(b)} />
      {seasonModal && (
        <SeasonModal seasons={getSeasonsList(m)} current={viewSeason} onClose={() => setSeasonModal(false)}
          onPick={(n) => navigate(`/episodes?id=${id}&s=${n}`)} />
      )}
      <DownloadSheet req={dl} onClose={() => setDl(null)} />
    </ImmersivePage>
  );
}
