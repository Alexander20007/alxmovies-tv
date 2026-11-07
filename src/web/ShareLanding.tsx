import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { posterUrl, backdropUrl, tmdb } from "@/services/tmdb";
import { DownloadButton, Footer, Nav } from "./Chrome";
import { APP_PACKAGE, isAndroid } from "./release";

/**
 * Quem abre um link compartilhado SEM o app instalado cai aqui: mostra o que foi compartilhado
 * e leva para baixar o app (ou abrir, se já tiver). O site em si não reproduz nada.
 */
export default function ShareLanding() {
  const { pathname, search } = useLocation();
  const [params] = useSearchParams();
  const id = Number(params.get("id"));
  const type = params.get("type") === "tv" || pathname === "/episodes" ? "tv" : "movie";
  const isTitle = /^\/(details|info|episodes|watch)$/.test(pathname) && !!id;
  const isPerson = pathname === "/person" && !!id;
  const channel = pathname === "/canal" ? params.get("n") : null;
  const isRoom = pathname === "/sala" || pathname === "/salas";

  const title = useQuery({ queryKey: ["share-title", type, id], queryFn: () => tmdb.details(type, id) as Promise<any>, enabled: isTitle, retry: 0 });
  const person = useQuery({ queryKey: ["share-person", id], queryFn: () => tmdb.person(id) as Promise<any>, enabled: isPerson, retry: 0 });
  const t: any = title.data;
  const p: any = person.data;

  const name = t ? (t.title ?? t.name) : p ? p.name : channel ?? (isRoom ? "Uma sala no ALXmovies" : "ALXmovies");
  const sub = t ? [(t.release_date ?? t.first_air_date ?? "").slice(0, 4), t.genres?.[0]?.name, t.vote_average ? `★ ${t.vote_average.toFixed(1)}` : ""].filter(Boolean).join(" · ")
    : p ? (p.known_for_department === "Acting" ? "Atuação" : p.known_for_department ?? "") : channel ? "Canal de TV ao vivo" : isRoom ? "Convite para assistir junto" : "";
  const text = t?.overview || (p?.biography ? String(p.biography).slice(0, 320) + "…" : "") || (isRoom ? "Alguém te chamou para ver algo ao mesmo tempo, com chat e reações. Abra no app do ALXmovies." : "");
  const img = t ? (t.backdrop_path ? backdropUrl(t.backdrop_path, "w780") : posterUrl(t.poster_path, "w500")) : p?.profile_path ? posterUrl(p.profile_path, "w500") : null;
  const poster = t?.poster_path ? posterUrl(t.poster_path, "w342") : p?.profile_path ? posterUrl(p.profile_path, "w342") : null;

  useEffect(() => { document.title = `${name} — ALXmovies`; }, [name]);

  // "Abrir no app" (Android): intent do Chrome; se o app não existir, cai de volta aqui com o botão de baixar
  const intent = `intent://${window.location.host}${pathname}${search}#Intent;scheme=https;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(window.location.origin + "/")};end`;

  return (
    <div className="wb">
      <Nav />
      <main className="wb-share">
        {img && <div className="wb-share-bg" style={{ backgroundImage: `url(${img})` }} aria-hidden />}
        <div className="wb-share-card">
          {poster && <img src={poster} alt="" />}
          <div>
            <span className="wb-pill">Compartilhado com você</span>
            <h1>{name}</h1>
            {sub && <p className="wb-share-sub">{sub}</p>}
            {text && <p className="wb-share-text">{text}</p>}
            <p className="wb-share-note">Assista no app do ALXmovies.</p>
            <div className="wb-cta">
              {isAndroid() && <a className="wb-btn primary big" href={intent}><span>Abrir no app</span></a>}
              <DownloadButton big label={isAndroid() ? "Baixar o app" : "Baixar o app para Android"} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
