import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useProfile } from "@/context/ProfileContext";

/** Botão flutuante da Laura IA: só aparece na tela inicial e abre a tela cheia (/laura). */
export function AiFab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  if (pathname !== "/home" || !activeProfile) return null;
  return (
    <button type="button" className="laura-fab" aria-label="Laura IA" onClick={() => navigate("/laura")}>
      <span className="laura-fab-orb"><Icon name="sparkles" size={22} strokeWidth={2.2} /></span>
      <span className="laura-fab-label">Laura IA</span>
    </button>
  );
}
