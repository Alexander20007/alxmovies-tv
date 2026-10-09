import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { MediaRow } from "@/components/MediaRow";
import { useGuardedMedia } from "@/hooks/useGuardedMedia";
import { useMediaParams } from "@/hooks/useQueryParams";
import { filterForProfile } from "@/lib/contentFilter";
import { formatDateBR, getSeasonsList } from "@/lib/media";
import { backdropUrl, posterUrl } from "@/services/tmdb";

const intl = (type: "language" | "region", code?: string) => {
  if (!code) return "";
  try { return new Intl.DisplayNames(["pt-BR"], { type }).of(code) || code; } catch { return code; }
};
const money = (n?: number) => (n ? n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "");
const names = (list?: any[], key = "name") => (list ?? []).map((x) => x[key]).filter(Boolean).join(", ");

export default function Info() {
  const { id, type } = useMediaParams();
  const isTv = type === "tv";
  const { media, loading, error, blocked, profile } = useGuardedMedia(type, id);
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
  const runtime = m.runtime ? `${m.runtime} min` : m.episode_run_time?.[0] ? `${m.episode_run_time[0]} min/ep` : "";
  const crew: any[] = m.credits?.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director").map((c) => c.name);
  const writers = [...new Set(crew.filter((c) => ["Writer", "Screenplay", "Story"].includes(c.job)).map((c) => c.name))];

  const rows = ([
    ["Tipo", isTv ? "Série" : "Filme"],
    ["Título original", original && original !== title ? original : ""],
    ["Tagline", m.tagline ?? ""],
    [isTv ? "Estreia" : "Lançamento", formatDateBR(release)],
    isTv ? ["Último episódio no ar", formatDateBR(m.last_air_date)] : null,
    [isTv ? "Duração/episódio" : "Duração", runtime],
    ["Gêneros", names(m.genres)],
    ["Avaliação TMDB", `⭐ ${m.vote_average?.toFixed(1) ?? "-"} (${m.vote_count ?? 0} votos)`],
    ["Idioma original", intl("language", m.original_language)],
    ["País", (m.production_countries ?? []).map((c: any) => intl("region", c.iso_3166_1)).join(", ")],
    isTv ? ["Status", m.status ?? ""] : null,
    isTv ? ["Temporadas", String(m.number_of_seasons ?? getSeasonsList(m).length)] : null,
    isTv ? ["Episódios", String(m.number_of_episodes ?? "")] : null,
    isTv ? ["Criação", names(m.created_by)] : ["Direção", directors.join(", ")],
    ["Roteiro", writers.slice(0, 4).join(", ")],
    isTv ? ["Emissora", names(m.networks)] : null,
    ["Produção", names(m.production_companies)],
    !isTv ? ["Orçamento", money(m.budget)] : null,
    !isTv ? ["Bilheteria", money(m.revenue)] : null,
  ] as ([string, string] | null)[]).filter((r): r is [string, string] => !!r && !!r[1]);

  const bg = m.backdrop_path ? backdropUrl(m.backdrop_path, "w1280") : posterUrl(m.poster_path, "w500");
  const cast: any[] = (m.credits?.cast ?? []).slice(0, 30);
  const similar = filterForProfile(m.similar?.results ?? [], profile).slice(0, 12);

  return (
    <ImmersivePage back={back} id="info-page">
      <div className="ex-hero ex-hero-sm">
        <div className="ex-hero-bg"><img src={bg ?? ""} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
        <div className="ex-hero-inner">
          <small className="ex-kicker">Informações{release ? ` · ${release.slice(0, 4)}` : ""}</small>
          <h1>{title}</h1>
          {m.tagline && <p className="ex-tagline">“{m.tagline}”</p>}
        </div>
      </div>

      <div className="info-wrap">
        {m.overview && <div className="dx-synopsis"><h3>Sinopse</h3><p>{m.overview}</p></div>}
        <div className="d2-info-grid">
          {rows.map(([b, v]) => <div key={b} className="d2-info-row"><b>{b}</b><span>{v}</span></div>)}
        </div>

        {cast.length > 0 && (
          <div className="details-section info-section">
            <h3>Elenco</h3>
            <div className="info-cast-grid">
              {cast.map((p) => (
                <div key={`${p.id}-${p.character}`} className="cast-item">
                  <img src={posterUrl(p.profile_path, "w200")} alt={p.name} loading="lazy"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
                  <div className="cast-name">{p.name}</div>
                  <div className="cast-character">{p.character ?? ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <MediaRow title="Títulos parecidos" items={similar} type={type} />
      </div>
    </ImmersivePage>
  );
}
