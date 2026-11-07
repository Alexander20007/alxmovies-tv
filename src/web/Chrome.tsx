import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { isAndroid, isIos, useRelease } from "./release";

export const Logo = () => <Link to="/" className="wb-logo" aria-label="ALXmovies">ALXMOVIES</Link>;

/** Botão grande de baixar o APK (mostra versão e tamanho). Em iPhone avisa que ainda não existe versão. */
export function DownloadButton({ big = false, label = "Baixar o app para Android" }: { big?: boolean; label?: string }) {
  const { info, apkUrl } = useRelease();
  const ios = isIos();
  if (ios) return <div className="wb-note">O ALXmovies ainda não está disponível para iPhone. Abra este site em um celular Android para baixar.</div>;
  return (
    <a className={`wb-btn primary${big ? " big" : ""}`} href={apkUrl} rel="noopener">
      <svg viewBox="0 0 24 24" width={big ? 24 : 20} height={big ? 24 : 20} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></svg>
      <span>{label}</span>
      {big && info && <em>v{info.version}{info.sizeMb ? ` · ${String(info.sizeMb).replace(".", ",")} MB` : ""}</em>}
    </a>
  );
}

export function Nav() {
  const { user } = useAuth();
  const logged = !!user && !user.is_anonymous;
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname, loc.hash]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 12);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`wb-nav${solid ? " solid" : ""}`}>
      <Logo />
      <nav>
        <a href="/#recursos">Recursos</a>
        <a href="/#telas">Telas</a>
        <a href="/#instalar">Como instalar</a>
        <a href="/#faq">Dúvidas</a>
        <Link to="/planos">Planos</Link>
        <Link to="/roda">Roda da Sorte</Link>
      </nav>
      <Link className="wb-btn wb-nav-acc" to={logged ? "/conta" : "/entrar"}>{logged ? "Minha conta" : "Entrar"}</Link>
      <DownloadButton label="Baixar" />
      <button type="button" className="wb-burger" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && createPortal(
        <nav className="wb-drawer" aria-label="Menu">
          <Link className="hot" to={logged ? "/conta" : "/entrar"}>{logged ? "Minha conta" : "Entrar ou criar conta"}<span>›</span></Link>
          <Link to="/roda">🎡 Roda da Sorte<span>›</span></Link>
          <Link to="/planos">Planos<span>›</span></Link>
          <Link to="/admin/teste">Seja admin<span>›</span></Link>
          <small>O app</small>
          <a href="/#recursos">Recursos<span>›</span></a>
          <a href="/#telas">Telas<span>›</span></a>
          <a href="/#instalar">Como instalar<span>›</span></a>
          <a href="/#faq">Dúvidas<span>›</span></a>
        </nav>,
        document.body,
      )}
    </header>
  );
}

export function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="wb-footer">
      {children}
      <Logo />
      <p>Filmes, séries e TV ao vivo no seu celular Android.</p>
      <p className="wb-links"><Link to="/planos">Planos</Link><Link to="/roda">Roda da Sorte</Link><Link to="/admin/teste">Seja admin</Link><Link to="/privacidade">Privacidade</Link><Link to="/cookies">Cookies</Link><Link to="/seguranca">Segurança</Link></p>
      <p className="wb-tmdb">Este produto usa a API do TMDB, mas não é endossado ou certificado pelo TMDB.</p>
    </footer>
  );
}
