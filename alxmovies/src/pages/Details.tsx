import { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CommentSheet, CommentsSection } from "@/components/details/Comments";
import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { SeasonModal } from "@/components/SeasonModal";
import { useGuardedMedia } from "@/hooks/useGuardedMedia";
import { useMediaParams } from "@/hooks/useQueryParams";
import { getSeasonsList, pickStartEpisode, seasonLabel } from "@/lib/media";
import { addFavorite, isFavorite, removeFavorite } from "@/services/library";
import { addComment, getRating, getRatingSummary, setRating, type RatingValue } from "@/services/social";
import { backdropUrl, posterUrl } from "@/services/tmdb";
import { isNative, shareLink } from "@/lib/native";
import { Icon } from "@/components/Icon";

const RATINGS: { value: RatingValue; icon: string; title: string }[] = [
  { value: "disliked", icon: "👎", title: "Não gostei" },
  { value: "liked", icon: "👍", title: "Gostei" },
  { value: "loved", icon: "❤️", title: "Amei" },
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
    <div className="dx-synopsis">
      <h3>Sinopse</h3>
      <p ref={ref} className={clamped ? "clamped" : ""}>{text}</p>
      {overflow && <button type="button" className="dx-more" onClick={() => setClamped((c) => !c)}>{clamped ? "Ler mais" : "Ler menos"}</button>}
      {!overflow && !clamped && <button type="button" className="dx-more" onClick={() => setClamped(true)}>Ler menos</button>}
      {fallback && <p style={{ color: "#888", fontSize: "0.78rem", marginTop: 8 }}>Disponível apenas em inglês.</p>}
    </div>
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

  const [seasonModal, setSeasonModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pop, setPop] = useState(false);
  const [copied, setCopied] = useState(false);

  const fav = useQuery({ queryKey: ["fav", pid, type, id], queryFn: () => isFavorite(pid, id, type), enabled: !!media && !blocked });
  const myRating = useQuery({ queryKey: ["rating", pid, type, id], queryFn: () => getRating(pid, id, type), enabled: !!media && !blocked });
  const summary = useQuery({ queryKey: ["ratingSummary", type, id], queryFn: () => getRatingSummary(id, type), enabled: !!media && !blocked });

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
    return <ImmersivePage back="/home"><SubEmpty title="Não foi possível carregar este título" text="Tente voltar e clicar novamente." to="/home" label="Voltar ao início" /></ImmersivePage>;
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
  const isRecent = !!releaseDate && Date.now() - new Date(releaseDate).getTime() < 1000 * 60 * 60 * 24 * 60;
  const badge = isRecent ? "🆕 Novo" : isTv ? "📺 Série" : "🎬 Filme";
  const rating = m.vote_average ? m.vote_average.toFixed(1) : null;
  const heroImg = m.backdrop_path ? backdropUrl(m.backdrop_path, "w1280") : posterUrl(m.poster_path, "w500");
  const start = isTv ? pickStartEpisode(m, pid, id, params) : null;
  const viewSeason = start?.season ?? 1;

  document.title = `${title} | ALXmovies`;

  const play = () =>
    navigate(isTv && start ? `/watch?id=${id}&type=tv&s=${start.season}&e=${start.episode}` : `/watch?id=${id}&type=movie`);

  async function share() {
    const url = `${window.location.origin}/details?id=${id}&type=${type}`;
    const r = await shareLink({ title: `${title} — ALXmovies`, url });
    if (r === "copied") { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  const sum = summary.data;
  const total = sum ? sum.liked + sum.loved + sum.disliked : 0;

  return (
    <ImmersivePage back="/home">
      <div className="details-hero">
        <div className="dx-hero">
          <div className="dx-bg"><img src={heroImg ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
          <div className="dx-hero-inner">
            <div className="dx-poster">
              <img src={posterUrl(m.poster_path, "w500")} alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
            </div>
            <div className="dx-info">
              <span className={`dx-badge ${isRecent ? "new" : ""}`}>{badge}</span>
              <h1 className="dx-title">{title}</h1>
              <div className="dx-meta">
                {rating && <span className="dx-rate">★ {rating}</span>}
                {year && <span>{year}</span>}
                {runtime && <span>{runtime}</span>}
              </div>
              {m.genres?.length > 0 && (
                <div className="dx-genres">{m.genres.slice(0, 4).map((g: any) => <span key={g.id} className="dx-chip">{g.name}</span>)}</div>
              )}

              <div className="dx-cta">
                <button className="dx-play" type="button" onClick={play}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
                  Assistir
                </button>
                {isTv && (
                  <>
                    <button className="dx-ghost" type="button" onClick={() => setSeasonModal(true)}>{seasonLabel(viewSeason)} ▾</button>
                    <button className="dx-ghost" type="button" onClick={() => navigate(`/episodes?id=${id}&s=${viewSeason}`)}>Episódios</button>
                  </>
                )}
              </div>

              <div className="dx-icons">
                <button className={`dx-ic${fav.data ? " active" : ""}${pop ? " pop" : ""}`} type="button" disabled={toggleFav.isPending || fav.isLoading} onClick={() => toggleFav.mutate()}>
                  <span className="ic">{isNative ? <Icon name={fav.data ? "check" : "plus"} size={22} /> : fav.data ? "✓" : "＋"}</span><span className="lb">Lista</span>
                </button>
                <div className="dx-ic dx-rate-box">
                  <div className="rating-group">
                    {RATINGS.map((r) => (
                      <button key={r.value} type="button" title={r.title} className={myRating.data === r.value ? "active" : ""} onClick={() => rate.mutate(r.value)}>{r.icon}</button>
                    ))}
                  </div>
                  <span className="lb">Avaliar</span>
                </div>
                <button className="dx-ic" type="button" onClick={() => void share()}>
                  <span className="ic">{isNative ? <Icon name="share" size={22} /> : "↗"}</span><span className="lb">{copied ? "Copiado!" : "Enviar"}</span>
                </button>
                <button className="dx-ic" type="button" onClick={() => navigate(`/salas?${new URLSearchParams({ tmdbId: String(id), mediaType: type, title, poster: m.poster_path || "" })}`)}>
                  <span className="ic">{isNative ? <Icon name="users" size={22} /> : "👥"}</span><span className="lb">Sala</span>
                </button>
                <button className="dx-ic" type="button" onClick={() => setSheet(true)}><span className="ic">{isNative ? <Icon name="chat" size={22} /> : "💬"}</span><span className="lb">Comentar</span></button>
              </div>
              <div className="rating-summary">
                {summary.isSuccess && (total === 0 ? "Ainda sem avaliações de outros usuários." : <>👍 {sum!.liked}&nbsp;&nbsp;❤️ {sum!.loved}&nbsp;&nbsp;👎 {sum!.disliked}</>)}
              </div>
            </div>
          </div>
        </div>

        <nav className="dx-tabs" aria-label="Seções">
          <button className="dx-tab active" type="button">Visão geral</button>
          <Link className="dx-tab" to={`/info?id=${id}&type=${type}`}>Informações</Link>
          {isTv && <Link className="dx-tab" to={`/episodes?id=${id}`}>Episódios</Link>}
        </nav>
      </div>

      <div className="d2-panel active" id="extra-sections">
        <Synopsis text={m.overview || "Sinopse não disponível para este título."} fallback={!!m._overviewFallback} />
        <CommentsSection type={type} id={id} profileId={pid} />
      </div>

      <CommentSheet open={sheet} onClose={() => setSheet(false)} onSubmit={(b) => comment.mutateAsync(b)} />
      {seasonModal && (
        <SeasonModal seasons={getSeasonsList(m)} current={viewSeason} onClose={() => setSeasonModal(false)}
          onPick={(n) => navigate(`/episodes?id=${id}&s=${n}`)} />
      )}
    </ImmersivePage>
  );
}
