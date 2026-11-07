import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { MediaRow } from "@/components/MediaRow";
import { Icon } from "@/components/Icon";
import { useProfile } from "@/context/ProfileContext";
import { filterForProfile } from "@/lib/contentFilter";
import { formatDateBR } from "@/lib/media";
import { posterUrl, tmdb } from "@/services/tmdb";
import type { MediaItem } from "@/types";

const DEPT: Record<string, string> = {
  Acting: "Atuação", Directing: "Direção", Writing: "Roteiro", Production: "Produção", Sound: "Música e som",
  Camera: "Fotografia", Editing: "Edição", Art: "Arte", "Visual Effects": "Efeitos visuais", Creator: "Criação",
};

type Filter = "all" | "movie" | "tv";
interface Credit extends MediaItem { role: string; date: string; popularity: number }

function ageOf(birth?: string, death?: string) {
  if (!birth) return null;
  const b = new Date(birth), e = death ? new Date(death) : new Date();
  let a = e.getFullYear() - b.getFullYear();
  if (e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

export default function Person() {
  const [params] = useSearchParams();
  const id = Number(params.get("id"));
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const [bioOpen, setBioOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(20);

  const q = useQuery({ queryKey: ["person", id], queryFn: () => tmdb.person(id), enabled: !!id, staleTime: 10 * 60_000 });
  const p = q.data as any;

  const credits = useMemo<Credit[]>(() => {
    if (!p) return [];
    const map = new Map<string, Credit>();
    const add = (c: any, role: string) => {
      if (!c || (c.media_type !== "movie" && c.media_type !== "tv")) return;
      const key = `${c.media_type}-${c.id}`;
      if (map.has(key)) return;
      map.set(key, { ...c, role, date: c.release_date || c.first_air_date || "", popularity: c.popularity ?? 0 });
    };
    (p.combined_credits?.cast ?? []).forEach((c: any) => add(c, c.character ? `como ${c.character}` : "Elenco"));
    (p.combined_credits?.crew ?? []).forEach((c: any) => add(c, c.job ? (DEPT[c.job] ?? c.job) : (DEPT[c.department] ?? c.department ?? "")));
    return filterForProfile([...map.values()], activeProfile) as Credit[];
  }, [p, activeProfile]);

  const known = useMemo(() => [...credits].sort((a, b) => b.popularity - a.popularity).filter((c) => c.poster_path).slice(0, 14), [credits]);
  const filmography = useMemo(
    () => credits.filter((c) => filter === "all" || c.media_type === filter).sort((a, b) => (b.date || "0").localeCompare(a.date || "0")),
    [credits, filter],
  );
  const counts = { all: credits.length, movie: credits.filter((c) => c.media_type === "movie").length, tv: credits.filter((c) => c.media_type === "tv").length };

  const goBack = () => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate("/home", { replace: true }); };

  if (!id) return <ImmersivePage back="/home"><SubEmpty title="Pessoa inválida" text="Não encontramos esta pessoa." to="/home" /></ImmersivePage>;
  if (q.isLoading) return <ImmersivePage back="/home"><SubSkeleton /></ImmersivePage>;
  if (q.isError || !p) return <ImmersivePage back="/home"><SubEmpty title="Não foi possível carregar" text="Tente voltar e clicar novamente." to="/home" label="Voltar ao início" /></ImmersivePage>;

  const age = ageOf(p.birthday, p.deathday);
  const dept = DEPT[p.known_for_department] ?? p.known_for_department ?? "";
  document.title = `${p.name} | ALXmovies`;

  return (
    <ImmersivePage back="/home" id="person-page" bar={false}>
      <div className="dv pp">
        <header className="pp-hero">
          <div className="dv-bg">{p.profile_path && <img src={posterUrl(p.profile_path, "w500")} alt="" />}</div>
          <div className="dv-top">
            <button type="button" className="dv-round" aria-label="Voltar" onClick={goBack}><Icon name="arrowLeft" size={22} strokeWidth={2.4} /></button>
          </div>
          <div className="pp-photo">
            {p.profile_path
              ? <img src={posterUrl(p.profile_path, "w500")} alt={p.name} />
              : <span className="pc-none"><Icon name="user" size={64} strokeWidth={1.5} /></span>}
          </div>
        </header>

        <h1 className="dv-title">{p.name}</h1>
        <div className="dv-meta">{dept && <span>{dept}</span>}{age != null && <span>{age} anos{p.deathday ? " (falecido)" : ""}</span>}</div>
        <div className="pp-facts">
          {p.birthday && <div><small>Nascimento</small><b>{formatDateBR(p.birthday)}</b></div>}
          {p.deathday && <div><small>Falecimento</small><b>{formatDateBR(p.deathday)}</b></div>}
          {p.place_of_birth && <div><small>Local</small><b>{p.place_of_birth}</b></div>}
        </div>

        {p.biography && (
          <section className="dv-card dv-synopsis">
            <p className={bioOpen ? "" : "clamped bio"}>{p.biography}</p>
            <button type="button" className="dv-more" onClick={() => setBioOpen((o) => !o)}>{bioOpen ? "Mostrar menos" : "Mostrar mais"}</button>
            {p._bioFallback && <small className="dv-note">Biografia disponível apenas em inglês.</small>}
          </section>
        )}

        {known.length > 0 && <div className="dv-similar"><MediaRow title="Conhecido por" items={known} /></div>}

        <div className="dv-section-head"><div><h2>Filmografia</h2><small>{counts.all} {counts.all === 1 ? "título" : "títulos"}</small></div></div>
        <div className="dv-tabs pp-tabs" role="tablist">
          {([["all", "Todos"], ["movie", "Filmes"], ["tv", "Séries"]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => { setFilter(f); setLimit(20); }}>
              {label} <i>{counts[f]}</i>
            </button>
          ))}
        </div>

        <div className="pp-list">
          {filmography.slice(0, limit).map((c) => (
            <button key={`${c.media_type}-${c.id}`} type="button" className="pp-item" onClick={() => navigate(`/details?id=${c.id}&type=${c.media_type}`)}>
              <img src={posterUrl(c.poster_path, "w185")} alt="" loading="lazy" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
              <span className="pp-item-txt">
                <b>{c.title ?? c.name}</b>
                <small>{c.date ? c.date.slice(0, 4) : "Sem data"} · {c.media_type === "tv" ? "Série" : "Filme"}</small>
                {c.role && <em>{c.role}</em>}
              </span>
              {c.vote_average ? <span className="pp-star">★ {c.vote_average.toFixed(1)}</span> : null}
            </button>
          ))}
          {!filmography.length && <p className="pp-empty">Nada por aqui.</p>}
        </div>
        {filmography.length > limit && <button type="button" className="dv-chip-btn pp-more" onClick={() => setLimit((l) => l + 20)}>Ver mais</button>}
        <p className="inf-tmdb">Informações complementares fornecidas pelo TMDB.</p>
      </div>
    </ImmersivePage>
  );
}
