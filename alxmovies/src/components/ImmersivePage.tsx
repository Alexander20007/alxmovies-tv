import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

/** Página sem cabeçalho: só os botões flutuantes de voltar/início (css/immersive.css). */
export function ImmersivePage({ back, id, children }: { back: string; id?: string; children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add("immersive");
    return () => document.body.classList.remove("immersive");
  }, []);

  return (
    <>
      <div className="im-bar">
        <Link className="im-btn" to={back} aria-label="Voltar">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <Link className="im-btn" to="/home" aria-label="Início">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>
        </Link>
      </div>
      <main id={id} className="sub-page">{children}</main>
    </>
  );
}

export function SubSkeleton() {
  return (
    <>
      <div className="ex-hero ex-hero-sk"><div className="ex-hero-inner"><i className="sk sk-line w40" /><i className="sk sk-title" /><i className="sk sk-line w60" /></div></div>
      <div className="sk-block"><i className="sk sk-line" /><i className="sk sk-line" /><i className="sk sk-line short" /></div>
    </>
  );
}

export function SubEmpty({ title, text, to, label }: { title: string; text: string; to?: string; label?: string }) {
  return (
    <div className="sub-empty">
      <h1>{title}</h1>
      <p>{text}</p>
      {to && <Link className="action-btn" to={to}>{label ?? "Voltar"}</Link>}
    </div>
  );
}
