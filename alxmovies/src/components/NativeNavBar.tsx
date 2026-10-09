import { Link, useLocation } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useChannelsUi } from "@/context/ChannelsUiContext";

const DESTINATIONS: { to: string; icon: IconName; label: string }[] = [
  { to: "/home", icon: "home", label: "Início" },
  { to: "/search", icon: "search", label: "Buscar" },
  { to: "", icon: "tv", label: "Canais" },
  { to: "/salas", icon: "users", label: "Salas" },
  { to: "/mylist", icon: "bookmark", label: "Lista" },
];
export const NAV_VISIBLE_ON = new Set(["/home", "/search", "/mylist", "/salas"]);

/** Barra de navegação inferior do Material 3 (ícone dentro de uma "pílula" quando selecionado). */
export function NativeNavBar() {
  const { pathname } = useLocation();
  const { openPanel } = useChannelsUi();
  if (!NAV_VISIBLE_ON.has(pathname)) return null;

  return (
    <nav className="nnav" aria-label="Navegação principal">
      {DESTINATIONS.map((d) => {
        const active = d.to !== "" && pathname === d.to;
        const inner = (
          <>
            <span className="nnav-pill"><Icon name={d.icon} size={24} strokeWidth={active ? 2.4 : 2} /></span>
            <span className="nnav-label">{d.label}</span>
          </>
        );
        return d.to === ""
          ? <button key="canais" type="button" className="nnav-item" onClick={openPanel}>{inner}</button>
          : <Link key={d.to} to={d.to} className={`nnav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{inner}</Link>;
      })}
    </nav>
  );
}
