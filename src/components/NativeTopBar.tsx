import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { MessagesButton, NotificationBell, type PanelName } from "@/components/HeaderPanels";
import { ProfileSheet } from "@/components/ProfileSheet";
import { useProfile } from "@/context/ProfileContext";
import { useBackClose } from "@/hooks/useBackClose";

const TITLES: Record<string, string> = {
  "/search": "Buscar", "/mylist": "Minha lista", "/salas": "Salas", "/amigos": "Amigos", "/mensagens": "Mensagens", "/account": "Minha conta",
};
const ROOTS = new Set(["/home", "/search", "/mylist", "/salas"]);

/** Barra superior do Material 3: título da tela, ações (buscar, mensagens, avisos) e o avatar do perfil. */
export function NativeTopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const [panel, setPanel] = useState<PanelName>(null);
  const [scrolled, setScrolled] = useState(false);
  useBackClose(panel !== null, () => setPanel(null));

  useEffect(() => { setPanel(null); }, [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  const isHome = pathname === "/home";
  const isRoot = ROOTS.has(pathname);
  const toggle = (name: Exclude<PanelName, null>) => () => setPanel((p) => (p === name ? null : name));
  const avatar = activeProfile?.avatar
    ? <img src={activeProfile.avatar} alt="" onError={(e) => e.currentTarget.remove()} />
    : (activeProfile?.name ?? "?").charAt(0).toUpperCase();

  return (
    <>
      <header className={`ntb${isHome && !scrolled ? " transparent" : ""}${scrolled || !isHome ? " solid" : ""}`}>
        {!isRoot && (
          <button type="button" className="ntb-icon" aria-label="Voltar" onClick={() => navigate(-1)}><Icon name="arrowLeft" /></button>
        )}
        {isHome
          ? <div className="ntb-title ntb-brand">ALX<span>movies</span></div>
          : <div className="ntb-title">{TITLES[pathname] ?? "ALXmovies"}</div>}

        {isHome && (
          <button type="button" className="ntb-icon" aria-label="Buscar" onClick={() => navigate("/search")}><Icon name="search" /></button>
        )}
        <MessagesButton open={panel === "msgs"} toggle={toggle("msgs")} />
        <NotificationBell open={panel === "bell"} toggle={toggle("bell")} />
        <button type="button" className="ntb-avatar" aria-label="Perfil" onClick={(e) => { e.stopPropagation(); toggle("profile")(); }}>
          <span>{avatar}</span>
        </button>
      </header>

      <div className={`native-scrim${panel ? " show" : ""}`} onClick={() => setPanel(null)} />
      <ProfileSheet open={panel === "profile"} onClose={() => setPanel(null)} />
    </>
  );
}
