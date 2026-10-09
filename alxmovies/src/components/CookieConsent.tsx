import { useState } from "react";
import { Link } from "react-router-dom";

const CONSENT_KEY = "alxmovies_cookie_consent";
export const getCookieConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };

export function CookieConsent() {
  const [visible, setVisible] = useState(() => !getCookieConsent());
  if (!visible) return null;
  const choose = (value: "all" | "essential") => {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* modo privado: some só nesta visita */ }
    setVisible(false);
  };
  return (
    <div className="cookie-consent-bar" role="dialog" aria-label="Aviso de cookies">
      <span>Usamos cookies essenciais para o site funcionar e cookies de terceiros para anúncios — veja nossa <Link to="/cookies">Política de Cookies</Link>.</span>
      <div className="cookie-consent-actions">
        <button type="button" className="cookie-consent-btn secondary" onClick={() => choose("essential")}>Só essenciais</button>
        <button type="button" className="cookie-consent-btn primary" onClick={() => choose("all")}>Aceitar todos</button>
      </div>
    </div>
  );
}
