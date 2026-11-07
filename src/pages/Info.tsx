import { useState } from "react";
import { Link } from "react-router-dom";
import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { DetailTabs } from "@/components/DetailTabs";
import { Icon } from "@/components/Icon";
import { useGuardedMedia } from "@/hooks/useGuardedMedia";
import { useMediaParams } from "@/hooks/useQueryParams";
import { getCertification } from "@/lib/certification";
import { formatDateBR, getSeasonsList } from "@/lib/media";
import { backdropUrl, posterUrl } from "@/services/tmdb";

const intl = (type: "language" | "region", code?: string) => {
  if (!code) return "";
  try { return new Intl.DisplayNames(["pt-BR"], { type }).of(code) || code; } catch { return code; }
};
const money = (n?: number) => (n ? n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "");
const names = (list?: any[], key = "name") => (list ?? []).map((x) => x[key]).filter(Boolean).join(", ");

interface Person { id: number; key: string; name: string; role: string; photo: string | null; crew?: boolean }

function PersonCard({ p }: { p: Person }) {
  return (
    <Link className="pc" to={`/person?id=${p.id}`} aria-label={`${p.name}, ${p.role}`}>
      <div className="pc-photo">
        {p.photo
          ? <img src={posterUrl(p.photo, "w300")} alt={p.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          : <span className="pc-none"><Icon name="user" size={44} strokeWidth={1.6} /></span>}
        <span className="pc-badge"><Icon name="film" size={19} strokeWidth={2.2} /></span>
      </div>
      <b className="pc-name">{p.name}</b>
      <small className="pc-role">{p.role}</small>
    </Link>
  );
}

export default function Info() {
  const { id, type } = useMediaParams();
  const isTv = type === "tv";
  const { media, loading, error, blocked, profile } = useGuardedMedia(type, id);
  const [all, setAll] = useState(false);
  const back = `/details?id=${id}&type=${type}`;

  if (!id) return <ImmersivePage back="/home"><SubEmpty title="Título inválido" text="Não encontramos este título." to="/home" /></ImmersivePage>;
  if (loading) return <ImmersivePage back={back}><SubSkeleton /></ImmersivePage>;
  if (error || !media) return <ImmersivePage back={back}><SubEmpty title="Não foi possível carregar as informações" text="Tente voltar e clicar novamente." /></ImmersivePage>;
  if (blocked) {
    return (
      <ImmersivePage back="/home">
        <SubEmpty title="🔒 Conteúdo bloqueado" to="/profiles" label="Trocar de perfil"
          text={`Este título não está disponível para o perfil "${profile?.name ?? ""}" por causa da classificação indicativa configurada.`} />
      </ImmersivePage>
    );
  }

  const m = media as any;
  const title = m.title ?? m.name;
  const original = m.original_title ?? m.original_name ?? "";
  const release = m.release_date ?? m.first_air_date ?? "";
  const runtime = m.runtime ? `${m.runtime} min` : m.episode_run_time?.[0] ? `${m.episode_run_time[0]} min` : "";
  const crew: any[] = m.credits?.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director");
  const writers = crew.filter((c) => ["Writer", "Screenplay", "Story"].includes(c.job));
  const cert = getCertification(m, type);

  const rows = ([
    ["Tipo", isTv ? "Série" : "Filme"],
    ["Título original", original && original !== title ? original : ""],
    [isTv ? "Estreia" : "Lançamento", formatDateBR(release)],
    isTv ? ["Último episódio no ar", formatDateBR(m.last_air_date)] : null,
    [isTv ? "Duração por episódio" : "Duração", runtime],
    ["Gêneros", names(m.genres)],
    ["Idioma original", intl("language", m.original_language)],
    ["País", (m.production_countries ?? []).map((c: any) => intl("region", c.iso_3166_1)).join(", ")],
    isTv ? ["Status", m.status ?? ""] : null,
    isTv ? ["Temporadas", String(m.number_of_seasons ?? getSeasonsList(m).length)] : null,
    isTv ? ["Episódios", String(m.number_of_episodes ?? "")] : null,
    isTv ? ["Criação", names(m.created_by)] : ["Direção", [...new Set(directors.map((d) => d.name))].join(", ")],
    ["Roteiro", [...new Set(writers.map((w) => w.name))].slice(0, 4).join(", ")],
    isTv ? ["Emissora", names(m.networks)] : null,
    ["Produção", names(m.production_companies)],
    !isTv ? ["Orçamento", money(m.budget)] : null,
    !isTv ? ["Bilheteria", money(m.revenue)] : null,
  ] as ([string, string] | null)[]).filter((r): r is [string, string] => !!r && !!r[1]);

  // Elenco e equipe: direção/criação/roteiro primeiro, depois o elenco
  const people: Person[] = [];
  const seen = new Set<string>();
  const push = (p: Person) => { if (!seen.has(p.key)) { seen.add(p.key); people.push(p); } };
  if (isTv) (m.created_by ?? []).forEach((c: any) => push({ id: c.id, key: `c${c.id}`, name: c.name, role: "Criação", photo: c.profile_path ?? null, crew: true }));
  directors.forEach((c) => push({ id: c.id, key: `d${c.id}`, name: c.name, role: "Direção", photo: c.profile_path ?? null, crew: true }));
  writers.slice(0, 3).forEach((c) => push({ id: c.id, key: `w${c.id}`, name: c.name, role: "Roteiro", photo: c.profile_path ?? null, crew: true }));
  (m.credits?.cast ?? []).slice(0, 30).forEach((c: any) => push({ id: c.id, key: `a${c.id}`, name: c.name, role: "Elenco", photo: c.profile_path ?? null }));

  const bg = m.backdrop_path ? backdropUrl(m.backdrop_path, "w1280") : posterUrl(m.poster_path, "w500");
  const rating = m.vote_average ? m.vote_average.toFixed(1) : "-";
  const shown = all ? people : people.slice(0, 10);

  document.title = `${title} — Informações | ALXmovies`;

  return (
    <ImmersivePage back={back} id="info-page" bar={false}>
      <div className="dv inf">
        <header className="inf-hero">
          <div className="dv-bg"><img src={bg ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
          <div className="dv-top">
            <Link className="dv-round" to={back} replace aria-label="Voltar"><Icon name="arrowLeft" size={22} strokeWidth={2.4} /></Link>
          </div>
          <div className="inf-hero-txt">
            {cert && <span className={`dv-cert sm c${cert}`}>{cert}</span>}
            <h1 className="dv-title">{title}</h1>
            {m.tagline && <p className="inf-tag">“{m.tagline}”</p>}
          </div>
        </header>

        <DetailTabs id={id} type={type} active="info" />

        <div className="inf-stats">
          <div><small>Nota</small><b className="gold">★ {rating}</b><span>{m.vote_count ? `${m.vote_count.toLocaleString("pt-BR")} votos` : "sem votos"}</span></div>
          <div><small>{isTv ? "Estreia" : "Lançamento"}</small><b>{release ? release.slice(0, 4) : "-"}</b><span>{formatDateBR(release) || "—"}</span></div>
          <div><small>Duração</small><b>{runtime || "-"}</b><span>{isTv ? "por episódio" : "no total"}</span></div>
        </div>

        <section className="inf-card">
          {rows.map(([b, v]) => <div key={b} className="inf-row"><b>{b}</b><span>{v}</span></div>)}
        </section>

        {people.length > 0 && (
          <section className="inf-people">
            <div className="inf-people-head">
              <div>
                <h2>Elenco e equipe</h2>
                <small>Pessoas no elenco, direção, criação e roteiro</small>
              </div>
              {people.length > 10 && (
                <button type="button" onClick={() => setAll((a) => !a)}>{all ? "Menos" : "Mais"} <Icon name={all ? "chevronUp" : "chevronRight"} size={17} strokeWidth={2.6} /></button>
              )}
            </div>
            <div className={`inf-people-list${all ? " grid" : ""}`}>
              {shown.map((p) => <PersonCard key={p.key} p={p} />)}
            </div>
            <p className="inf-tmdb">Informações complementares fornecidas pelo TMDB.</p>
          </section>
        )}
      </div>
    </ImmersivePage>
  );
}
