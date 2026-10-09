import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useBackClose } from "@/hooks/useBackClose";

function Item({ to, icon, label, onClose, danger }: { to: string; icon: IconName; label: string; onClose: () => void; danger?: boolean }) {
  return (
    <Link className={`ns-item${danger ? " danger" : ""}`} to={to} onClick={onClose}>
      <Icon name={icon} size={22} /><span>{label}</span>
    </Link>
  );
}

/** Menu do perfil como painel que sobe de baixo (bottom sheet do Material). */
export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeProfile } = useProfile();
  const { user, signOut } = useAuth();
  const { enabled } = useSocial();
  const navigate = useNavigate();
  useBackClose(open, onClose);

  const avatar = activeProfile?.avatar
    ? <img src={activeProfile.avatar} alt="" onError={(e) => e.currentTarget.remove()} />
    : (activeProfile?.name ?? "?").charAt(0).toUpperCase();

  return (
    <div className={`ns-sheet${open ? " open" : ""}`} onClick={(e) => e.stopPropagation()} aria-hidden={!open}>
      <div className="ns-handle" />
      <div className="ns-head">
        <div className="ns-avatar" style={activeProfile?.avatar ? undefined : { background: activeProfile?.color_theme || "#555" }}>{avatar}</div>
        <div className="ns-head-text"><strong>{activeProfile?.name ?? "Perfil"}</strong><span>{user?.email ?? "Convidado"}</span></div>
      </div>

      <div className="ns-group">
        <Item to="/profiles" icon="swap" label="Trocar perfil" onClose={onClose} />
        <Item to="/manage-profiles" icon="edit" label="Editar perfis" onClose={onClose} />
      </div>
      {enabled && (
        <div className="ns-group">
          <Item to="/amigos" icon="userPlus" label="Amigos" onClose={onClose} />
          <Item to="/mensagens" icon="chat" label="Mensagens" onClose={onClose} />
        </div>
      )}
      <div className="ns-group">
        <Item to="/mylist" icon="bookmark" label="Minha lista" onClose={onClose} />
        <Item to="/mylist?tab=watching" icon="play" label="Continuar assistindo" onClose={onClose} />
        <Item to="/mylist?tab=watched" icon="check" label="Já assistidos" onClose={onClose} />
      </div>
      <div className="ns-group">
        {activeProfile?.is_admin && <Item to="/account" icon="settings" label="Painel da conta" onClose={onClose} />}
        <a className="ns-item" href="mailto:alxmovies.tv@gmail.com"><Icon name="help" size={22} /><span>Ajuda e suporte</span></a>
        <button className="ns-item danger" type="button" onClick={() => { onClose(); void signOut().then(() => navigate("/login")); }}>
          <Icon name="logout" size={22} /><span>Sair</span>
        </button>
      </div>
    </div>
  );
}
