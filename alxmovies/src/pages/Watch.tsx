import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlxPlayer, type ProgressInfo } from "@/components/player/AlxPlayer";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useMediaParams } from "@/hooks/useQueryParams";
import { isAllowedForProfile } from "@/lib/contentFilter";
import {
  ensureSeason, getSeasonsList, lsDel, lsGet, lsSet, pickStartEpisode, storageKey, todayISO, type EpRef,
} from "@/lib/media";
import { fetchContinueWatching, saveProgress } from "@/services/library";
import { triggerPopunderOnPlay } from "@/lib/ads";
import { announceWatching, stopWatching } from "@/services/friends";
import { backdropUrl, tmdb } from "@/services/tmdb";

interface Resume { resumeAt?: number; resumePercent?: number }

function Message({ title, text, to, label = "Voltar" }: { title: string; text: string; to: string; label?: string }) {
  return (
    <div className="watch-msg">
      <h1>{title}</h1>
      <p>{text}</p>
      <Link to={to}>{label}</Link>
    </div>
  );
}

export default function Watch() {
  const { id, type } = useMediaParams();
  const isTv = type === "tv";
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { user } = useAuth();
  const pid = activeProfile!.id;

  const { data: media, error } = useQuery({
    queryKey: ["details", type, id],
    queryFn: () => tmdb.details(type, id),
    enabled: !!id,
  });

  const [ep, setEp] = useState<EpRef | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [epName, setEpName] = useState("");
  const started = useRef(false);

  const title = media?.title ?? media?.name ?? "";
  const backHref = `/details?id=${id}&type=${type}`;

  const getResumeInfo = useCallback(async (season?: number, episode?: number): Promise<Resume> => {
    const secs = Number(lsGet(storageKey("resume", pid, type, id, season, episode)));
    if (secs > 5) return { resumeAt: secs };
    if (!isTv) {
      try {
        const list = await fetchContinueWatching(pid, 50);
        const item = list.find((i) => i.media_id === id && i.media_type === "movie");
        if (item && (item.progress ?? 0) >= 3) return { resumePercent: item.progress ?? 0 };
      } catch { /* começa do início */ }
    }
    return {};
  }, [pid, type, id, isTv]);

  // Define episódio inicial + ponto de retomada, uma vez
  useEffect(() => {
    if (!media || started.current) return;
    started.current = true;
    (async () => {
      const start = isTv ? pickStartEpisode(media, pid, id, params) : null;
      const r = await getResumeInfo(start?.season, start?.episode);
      setResume(r);
      setEp(start);
    })();
  }, [media, isTv, pid, id, params, getResumeInfo]);


  // "Assistindo agora" para os amigos (só conta real; o serviço respeita a privacidade do perfil)
  useEffect(() => {
    if (!media || user?.is_anonymous || (isTv && !ep)) return;
    const push = (force: boolean) => {
      if (document.visibilityState === "hidden") return;
      void announceWatching(pid, {
        mediaId: id, mediaType: type, title: media.title ?? media.name, posterPath: media.poster_path,
        season: isTv && ep ? ep.season : null, episode: isTv && ep ? ep.episode : null,
      }, force);
    };
    push(true);
    const t = setInterval(() => push(false), 15000); // o serviço limita a 1 envio a cada 45s
    const onHide = () => { void stopWatching(); };
    window.addEventListener("pagehide", onHide);
    return () => { clearInterval(t); window.removeEventListener("pagehide", onHide); void stopWatching(); };
  }, [media, ep, isTv, id, type, pid, user?.is_anonymous]);

  useEffect(() => { if (title) document.title = `${title} | ALXmovies`; }, [title]);

  // Nome do episódio no cabeçalho do player
  useEffect(() => {
    if (!isTv || !ep) return;
    let cancelled = false;
    ensureSeason(id, ep.season)
      .then((eps) => !cancelled && setEpName(eps.find((e) => e.number === ep.episode)?.name ?? ""))
      .catch(() => !cancelled && setEpName(""));
    return () => { cancelled = true; };
  }, [isTv, id, ep]);

  const handleProgress = useCallback(async ({ time, percent, ended, hasNext, request }: ProgressInfo) => {
    if (!media) return;
    const key = storageKey("resume", pid, type, id, request.season, request.episode);
    if (isTv && request.season != null) {
      lsSet(storageKey("lastep", pid, type, id), JSON.stringify({ season: request.season, episode: request.episode }));
    }
    if (percent >= 95 || ended) lsDel(key);
    else if (time > 5) lsSet(key, String(Math.floor(time)));

    if (time < 5 && !ended) return; // não sobrescreve progresso antigo com 0%
    const pct = isTv && hasNext ? Math.min(percent, 94) : percent;
    try {
      await saveProgress(pid, { media_id: id, media_type: type, title, poster_path: media.poster_path }, pct);
    } catch { /* silencioso: não interrompe o vídeo */ }
  }, [media, pid, type, id, isTv, title]);

  const findNextEpisode = useCallback(async (season: number, episode: number): Promise<EpRef | null> => {
    if (!media) return null;
    const today = todayISO();
    const eps = await ensureSeason(id, season);
    const nextIn = eps.find((e) => e.number > episode);
    if (nextIn) return nextIn.airDate && nextIn.airDate > today ? null : { season, episode: nextIn.number };
    const numbers = getSeasonsList(media).map((s) => s.season_number).sort((a, b) => a - b);
    const nextSeason = numbers[numbers.indexOf(season) + 1];
    if (nextSeason == null) return null;
    const first = (await ensureSeason(id, nextSeason))[0];
    if (!first || (first.airDate && first.airDate > today)) return null;
    return { season: nextSeason, episode: first.number };
  }, [media, id]);

  const onNext = useCallback((n: EpRef) => {
    setResume({}); // episódio novo começa do início
    setEp(n);
    lsSet(storageKey("lastep", pid, type, id), JSON.stringify(n));
    setParams({ id: String(id), type, s: String(n.season), e: String(n.episode) }, { replace: true });
  }, [pid, type, id, setParams]);

  const onClose = useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(backHref, { replace: true });
  }, [navigate, backHref]);

  const request = useMemo(
    () => ({ type, id, season: ep?.season, episode: ep?.episode }),
    [type, id, ep?.season, ep?.episode]
  );

  if (!id) return <Message title="Título inválido" text="Não encontramos este título." to="/home" />;
  if (error) return <Message title="Não foi possível abrir o player" text="Verifique sua conexão e tente de novo." to={backHref} />;
  if (!media || resume === null || (isTv && !ep)) return <div className="watch-loading">Carregando…</div>;
  if (!isAllowedForProfile(media, activeProfile)) {
    return (
      <Message
        title="🔒 Conteúdo bloqueado"
        text={`Este título não está disponível para o perfil "${activeProfile?.name ?? ""}" por causa da classificação indicativa.`}
        to="/profiles" label="Trocar de perfil"
      />
    );
  }

  return (
    <AlxPlayer
      title={title}
      subtitle={isTv && ep ? `T${ep.season} · E${ep.episode}${epName ? ` — ${epName}` : ""}` : undefined}
      poster={backdropUrl(media.backdrop_path, "w780") ?? undefined}
      request={request}
      resumeAt={resume.resumeAt}
      resumePercent={resume.resumePercent}
      getNextEpisode={isTv ? findNextEpisode : undefined}
      onProgress={handleProgress}
      onNext={onNext}
      onClose={onClose}
      onPlay={user?.is_anonymous ? triggerPopunderOnPlay : undefined}
    />
  );
}
