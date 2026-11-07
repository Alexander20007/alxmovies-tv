import { isNative } from "@/lib/native";
import { DownloadSheet, type DownloadRequest } from "@/components/DownloadSheet";
import { useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { SeasonModal } from "@/components/SeasonModal";
import { Icon } from "@/components/Icon";
import { useGuardedMedia } from "@/hooks/useGuardedMedia";
import { getCertification } from "@/lib/certification";
import { openCastSettings } from "@/lib/downloader";
import {
  ensureSeason, formatDateBR, getLastEpisode, getSeasonsList, seasonLabel, todayISO, type EpisodeInfo,
} from "@/lib/media";
import { posterUrl } from "@/services/tmdb";
import { epKey, fetchSeenEpisodes, setEpisodesSeen, type EpKey } from "@/services/seen";

interface CardProps {
  ep: EpisodeInfo; season: number; index: number; isLast: boolean; today: string; seen: boolean; open: boolean;
  onToggle: () => void; onPlay: () => void; onDownload?: () => void; onSeen: () => void;
}

function EpisodeCard({ ep, season, index, isLast, today, seen, open, onToggle, onPlay, onDownload, onSeen }: CardProps) {
  const soon = !!ep.airDate && ep.airDate > today;
  const date = soon ? `Estreia em ${formatDateBR(ep.airDate)}` : formatDateBR(ep.airDate);
  const overview = ep.overview || "Sinopse não disponível para este episódio.";
  const thumb = ep.still ? posterUrl(ep.still, "w300") : "/assets/no-poster.png";

  return (
    <article className={`ep3${open ? " open" : ""}${soon ? " soon" : ""}${seen ? " seen" : ""}${isLast ? " last" : ""}`} style={{ "--i": Math.min(index, 12) } as CSSProperties}>
      <div className="ep3-main">
        <button type="button" className="ep3-thumb" disabled={soon} aria-label={`Assistir episódio ${ep.number}`} onClick={onPlay}>
          <img loading="lazy" src={thumb} alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
          <span className="ep3-play">{soon ? <Icon name="clock" size={20} /> : <Icon name="play" size={22} />}</span>
          {isLast && !seen && <span className="ep3-tag">Continuar</span>}
          {seen && <span className="ep3-seen"><Icon name="check" size={14} strokeWidth={3} /></span>}
        </button>
        <button type="button" className="ep3-info" onClick={onToggle} aria-expanded={open}>
          <b>EP {season}x{ep.number}</b>
          <small>{date}{!soon && ep.runtime ? ` · ${ep.runtime} min` : ""}</small>
        </button>
        <button type="button" className="ep3-chev" onClick={onToggle} aria-label={open ? "Fechar detalhes" : "Abrir detalhes"}>
          <Icon name={open ? "chevronUp" : "chevronDown"} size={22} strokeWidth={2.4} />
        </button>
      </div>
      {open && (
        <div className="ep3-more">
          <h3>{ep.name || `Episódio ${ep.number}`}</h3>
          <p>{overview}</p>
          <div className="ep3-btns">
            {isNative && <button type="button" onClick={() => void openCastSettings()}><Icon name="cast" size={19} /> Espelhar</button>}
            {onDownload && !soon && <button type="button" onClick={onDownload}><Icon name="download" size={19} /> Baixar</button>}
            <button type="button" className={seen ? "on" : ""} onClick={onSeen}><Icon name={seen ? "eye" : "eyeOff"} size={19} /> {seen ? "Visto" : "Marcar visto"}</button>
          </div>
        </div>
      )}
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
  const [dl, setDl] = useState<DownloadRequest | null>(null);
  const [openEp, setOpenEp] = useState<number | null>(null);
  const [desc, setDesc] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const qc = useQueryClient();

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

  const seenQ = useQuery({ queryKey: ["epSeen", pid, id], queryFn: () => fetchSeenEpisodes(pid, id), enabled: !!media && !blocked });
  const seenSet = useMemo(() => new Set((seenQ.data ?? []).map((e) => epKey(e.season, e.episode))), [seenQ.data]);

  const mark = useMutation({
    mutationFn: ({ items, seen }: { items: EpKey[]; seen: boolean }) => setEpisodesSeen(
      pid, { id, title: media?.name ?? media?.title ?? "", poster_path: media?.poster_path ?? null, totalEpisodes: (media as any)?.number_of_episodes }, items, seen),
    onMutate: async ({ items, seen }) => {
      const key = ["epSeen", pid, id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<EpKey[]>(key) ?? [];
      const gone = new Set(items.map((e) => epKey(e.season, e.episode)));
      const next = seen ? [...prev.filter((e) => !gone.has(epKey(e.season, e.episode))), ...items] : prev.filter((e) => !gone.has(epKey(e.season, e.episode)));
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(["epSeen", pid, id], ctx.prev);
      alert("Não foi possível salvar agora: " + (e instanceof Error ? e.message : "tente de novo"));
    },
    onSettled: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(pid) }),
  });

  const shown = useMemo(() => {
    let list = eps.data ?? [];
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((e) => `${e.number} ${e.name ?? ""} ${e.overview ?? ""}`.toLowerCase().includes(t));
    return desc ? [...list].reverse() : list;
  }, [eps.data, q, desc]);

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
  const today = todayISO();
  const cert = getCertification(media, "tv");
  const isSeen = (n: number) => seenSet.has(epKey(viewSeason, n));
  const toggleSeen = (n: number) => mark.mutate({ items: [{ season: viewSeason, episode: n }], seen: !isSeen(n) });
  const aired = (eps.data ?? []).filter((e) => !e.airDate || e.airDate <= today);
  const seenInSeason = aired.filter((e) => isSeen(e.number)).length;
  const allSeen = aired.length > 0 && seenInSeason === aired.length;
  const toggleSeason = () => mark.mutate({ items: aired.map((e) => ({ season: viewSeason, episode: e.number })), seen: !allSeen });

  return (
    <ImmersivePage back={back} id="ep-page" bar={false}>
      <div className="ep3-page">
        <header className="ep3-bar">
          <button type="button" className="ep3-ib" aria-label="Voltar" onClick={() => navigate(back, { replace: true })}><Icon name="arrowLeft" size={24} /></button>
          {searching ? (
            <input className="ep3-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar episódio…" />
          ) : (
            <button type="button" className="ep3-titles" onClick={() => setModal(true)}>
              <b>{title}</b>
              <small>{seasonLabel(viewSeason)} <Icon name="chevronDown" size={14} strokeWidth={2.6} /></small>
            </button>
          )}
          {!searching && cert && <span className={`dv-cert sm c${cert}`}>{cert}</span>}
          <button type="button" className="ep3-ib" aria-label={searching ? "Fechar busca" : "Buscar"} onClick={() => { setSearching((s) => !s); setQ(""); }}>
            <Icon name={searching ? "close" : "search"} size={23} />
          </button>
          <button type="button" className={`ep3-ib${desc ? " on" : ""}`} aria-label="Inverter ordem" onClick={() => setDesc((d) => !d)}><Icon name="sort" size={23} /></button>
        </header>

        {aired.length > 0 && (
          <div className="ep3-sum">
            <span><b>{seenInSeason}</b> de {aired.length} vistos</span>
            <div className="ep3-sum-bar"><i style={{ width: `${Math.round((seenInSeason / aired.length) * 100)}%` }} /></div>
            <button type="button" disabled={mark.isPending} onClick={toggleSeason}>{allSeen ? "Desmarcar todos" : "Marcar todos"}</button>
          </div>
        )}

        <div className="ep3-list">
          {eps.isLoading && Array.from({ length: 5 }, (_, i) => <div key={i} className="ep3 ep3-skel"><div className="ep3-main"><div className="ep3-thumb sk" /><div className="ep3-info"><i className="sk sk-line" /><i className="sk sk-line short" /></div></div></div>)}
          {eps.isError && <div className="d2-ep-status">Não foi possível carregar os episódios.</div>}
          {eps.data && !eps.data.length && <div className="d2-ep-status">Nenhum episódio disponível.</div>}
          {eps.data && !!eps.data.length && !shown.length && <div className="d2-ep-status">Nenhum episódio encontrado.</div>}
          {shown.map((ep, i) => (
            <EpisodeCard key={ep.number} ep={ep} season={viewSeason} index={i} today={today} seen={isSeen(ep.number)}
              isLast={!!last && last.season === viewSeason && last.episode === ep.number}
              open={openEp === ep.number} onToggle={() => setOpenEp(openEp === ep.number ? null : ep.number)}
              onPlay={() => play(viewSeason, ep.number)} onSeen={() => toggleSeen(ep.number)}
              onDownload={isNative ? () => setDl({ type: "tv", id, title, season: viewSeason, episode: ep.number, poster: posterUrl(media?.poster_path ?? null, "w185") }) : undefined} />
          ))}
        </div>
      </div>

      {modal && (
        <SeasonModal seasons={seasons} current={viewSeason} onClose={() => setModal(false)}
          onPick={(n) => { setModal(false); setOpenEp(null); setParams({ id: String(id), type: "tv", s: String(n) }, { replace: true }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}
      <DownloadSheet req={dl} onClose={() => setDl(null)} />
    </ImmersivePage>
  );
}
