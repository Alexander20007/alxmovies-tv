import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { FloatingSearch } from "@/components/FloatingSearch";
import { MessagesButton, NotificationBell, type PanelName } from "@/components/HeaderPanels";
import { useAuth } from "@/context/AuthContext";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useBackClose } from "@/hooks/useBackClose";

export function Header() {
  const { activeProfile } = useProfile();
  const { user, signOut } = useAuth();
  const { enabled } = useSocial();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<PanelName>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useBackClose(panel !== null, () => setPanel(null));

  // Só um painel aberto por vez; clique fora fecha
  useEffect(() => {
    const close = () => setPanel(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const toggle = (name: Exclude<PanelName, null>) => () => setPanel((p) => (p === name ? null : name));

  const avatar = activeProfile?.avatar
    ? <img src={activeProfile.avatar} alt={activeProfile.name} onError={(e) => e.currentTarget.remove()} />
    : (activeProfile?.name ?? "?").charAt(0).toUpperCase();
  const avatarBg = activeProfile?.avatar ? undefined : { background: activeProfile?.color_theme || "#333" };

  return (
    <>
    <header className="site-header">
      <div className="site-logo" onClick={() => navigate("/home")}>ALXmovies</div>
      <div className="header-spacer" />
      <button type="button" className={`header-search-icon${searchOpen ? " active" : ""}`} aria-label="Buscar" onClick={(e) => { e.stopPropagation(); setPanel(null); setSearchOpen((o) => !o); }}>🔍</button>

      <MessagesButton open={panel === "msgs"} toggle={toggle("msgs")} />
      <NotificationBell open={panel === "bell"} toggle={toggle("bell")} />

      <div className="header-profile" onClick={(e) => { e.stopPropagation(); toggle("profile")(); }}>
        <div className="header-profile-avatar" title={activeProfile?.name} style={avatarBg}>{avatar}</div>
        <div className={`header-profile-menu${panel === "profile" ? " open" : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className="hpm-head">
            <div className="hpm-head-avatar" style={avatarBg}>{avatar}</div>
            <div className="hpm-head-info"><strong>{activeProfile?.name ?? "Perfil"}</strong><span>{user?.email ?? "\u00a0"}</span></div>
          </div>

          <div className="hpm-section">
            <Link to="/profiles" onClick={() => setPanel(null)}>🔀 Trocar perfil</Link>
            <Link to="/manage-profiles" onClick={() => setPanel(null)}>✎ Editar perfis</Link>
          </div>
          {enabled && (
            <div className="hpm-section" style={{ display: "flex" }}>
              <Link to="/amigos" onClick={() => setPanel(null)}>👥 Amigos</Link>
              <Link to="/mensagens" onClick={() => setPanel(null)}>💬 Mensagens</Link>
            </div>
          )}
          <div className="hpm-section">
            <Link to="/mylist" onClick={() => setPanel(null)}>📌 Minha Lista</Link>
            <Link to="/mylist?tab=watching" onClick={() => setPanel(null)}>▶ Continuar assistindo</Link>
            <Link to="/mylist?tab=watched" onClick={() => setPanel(null)}>✔ Já assistidos</Link>
          </div>
          {activeProfile?.is_admin && (
            <div className="hpm-section" style={{ display: "flex" }}>
              <Link to="/account" onClick={() => setPanel(null)}>⚙ Painel da conta</Link>
            </div>
          )}
          <div className="hpm-section"><a href="mailto:alxmovies.tv@gmail.com">❓ Ajuda e suporte</a></div>
          <div className="hpm-section">
            <button id="header-logout-btn" onClick={() => signOut().then(() => navigate("/login"))}>⏻ Sair</button>
          </div>
        </div>
      </div>
    </header>
    <FloatingSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export function BottomNav() {
  const { openPanel } = useChannelsUi();
  const item = (to: string, icon: string, label: string) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? "active" : "")}><span className="bn-icon">{icon}</span>{label}</NavLink>
  );
  return (
    <nav className="bottom-nav">
      {item("/home", "🏠", "Início")}
      {item("/search?type=movie", "🎬", "Filmes")}
      <button type="button" className="bn-canais-btn" onClick={openPanel}><span className="bn-icon">📡</span>Canais</button>
      {item("/mylist", "❤️", "Favoritos")}
      {item("/salas", "👥", "Salas")}
    </nav>
  );
}
