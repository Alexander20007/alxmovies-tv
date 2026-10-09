import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSocial } from "@/context/SocialContext";
import { parseRoomPayload, parseTitlePayload } from "@/lib/social";
import { posterUrl } from "@/services/tmdb";

export function SocAvatar({ name, avatar, color, live, size = "" }: { name?: string; avatar?: string | null; color?: string | null; live?: boolean; size?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`soc-avatar ${size}`} style={{ background: color || "#333" }}>
      {(name || "?").trim().charAt(0).toUpperCase() || "?"}
      {avatar && !broken && <img src={avatar} alt="" loading="lazy" onError={() => setBroken(true)} />}
      {live && <i className="soc-live-dot" title="Assistindo agora" />}
    </span>
  );
}

const cardImg = (poster: string | null) => (
  <img src={posterUrl(poster, "w185")} alt="" loading="lazy" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
);

export function TitleCard({ payload }: { payload: unknown }) {
  const t = parseTitlePayload(payload);
  if (!t) return <em>Indicação indisponível</em>;
  return (
    <div className="soc-card">
      {cardImg(t.poster)}
      <div className="soc-card-info">
        <small>🎬 Indicação</small>
        <strong>{t.title}</strong>
        {t.year && <span>{t.year}</span>}
        <div className="soc-card-btns">
          <Link to={`/details?id=${t.id}&type=${t.type}`}>Ver detalhes</Link>
          <Link to={`/watch?id=${t.id}&type=${t.type}`} className="primary">▶ Assistir</Link>
        </div>
      </div>
    </div>
  );
}

export function RoomInviteCard({ payload }: { payload: unknown }) {
  const r = parseRoomPayload(payload);
  if (!r) return <em>Convite indisponível</em>;
  return (
    <div className="soc-card">
      {cardImg(r.poster)}
      <div className="soc-card-info">
        <small>👥 Convite pra sala</small>
        <strong>{r.title}</strong>
        {r.movieTitle && <span>{r.movieTitle}</span>}
        <div className="soc-card-btns"><Link to={`/sala?id=${r.id}`} className="primary">Entrar na sala</Link></div>
      </div>
    </div>
  );
}

/** Mostra aviso (convidado / desativado / não instalado) ou os filhos quando tudo está ok. */
export function SocialGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { available, enabled, loading, error } = useSocial();

  let gate: { icon: string; title: string; text: string; to: string; label: string } | null = null;
  if (!available) {
    gate = {
      icon: "🎭", title: "Amigos só em conta de verdade",
      text: user?.is_anonymous
        ? "Contas de convidado duram 24 horas e não têm como manter amizades. Crie uma conta pra adicionar amigos e conversar."
        : "Escolha um perfil para usar amigos e mensagens.",
      to: user?.is_anonymous ? "/account" : "/profiles", label: user?.is_anonymous ? "Criar conta" : "Escolher perfil",
    };
  } else if (loading) {
    return <p style={{ padding: 24, color: "#fff" }}>Carregando…</p>;
  } else if (error) {
    gate = {
      icon: "⚠️", title: error.code === "NOT_INSTALLED" ? "Recurso ainda não instalado" : "Não foi possível abrir agora",
      text: error.message, to: "/home", label: "Voltar ao início",
    };
  } else if (!enabled) {
    gate = {
      icon: "🔒", title: "Amizades desativadas neste perfil",
      text: "Quem é responsável pela conta pode ativar em Painel da conta → Amigos e privacidade.", to: "/home", label: "Voltar ao início",
    };
  }

  if (!gate) return <>{children}</>;
  return (
    <div className="soc-gate" style={{ display: "block", margin: "24px auto", maxWidth: 480 }}>
      <div className="soc-gate-ico">{gate.icon}</div>
      <h2>{gate.title}</h2>
      <p>{gate.text}</p>
      <div className="soc-btn-row center"><Link className="soc-btn primary" to={gate.to}>{gate.label}</Link></div>
    </div>
  );
}
