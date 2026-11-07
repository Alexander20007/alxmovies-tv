import { useEffect, type ReactNode } from "react";
import { Footer, Nav } from "./Chrome";

/** Moldura das páginas internas do site: topo, conteúdo centralizado e rodapé. */
export function SitePage({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  useEffect(() => {
    const old = document.title;
    document.title = `${title.replace(/^[^\p{L}\p{N}]+/u, "")} · ALXmovies`;
    return () => { document.title = old; };
  }, [title]);
  return (
    <div className="wb">
      <Nav />
      <main className="wb-page">
        <h1>{title}</h1>
        {sub && <p className="wb-page-sub">{sub}</p>}
        {children}
      </main>
      <Footer />
    </div>
  );
}

/** Aceita só caminhos internos (evita redirecionar para outro site depois do login). */
export function safeNext(raw: string | null, fallback = "/conta") {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}
