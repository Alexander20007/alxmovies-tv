import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer id="site-footer" className="site-footer">
      <p>
        <Link to="/privacidade">Política de Privacidade</Link>
        <Link to="/cookies">Política de Cookies</Link>
        <Link to="/seguranca">Política de Segurança</Link>
      </p>
      <p className="site-footer-tmdb">Este produto usa a API do TMDB, mas não é endossado ou certificado pelo TMDB.</p>
    </footer>
  );
}
