import { Link } from "react-router-dom";
import type { MediaType } from "@/types";

/** Abas "Visão geral" / "Informações" (as duas telas usam a mesma barra). */
export function DetailTabs({ id, type, active }: { id: number; type: MediaType; active: "overview" | "info" }) {
  return (
    <nav className="dv-tabs" aria-label="Seções">
      <Link replace to={`/details?id=${id}&type=${type}`} className={active === "overview" ? "on" : ""} aria-current={active === "overview" ? "page" : undefined}>Visão geral</Link>
      <Link replace to={`/info?id=${id}&type=${type}`} className={active === "info" ? "on" : ""} aria-current={active === "info" ? "page" : undefined}>Informações</Link>
    </nav>
  );
}
