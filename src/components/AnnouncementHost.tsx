import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { VerifiedBadge } from "@/components/VerifiedName";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { openExternal } from "@/lib/native";

/** Mostra o aviso mais novo uma vez (os anteriores ficam na tela Notificações). */
export function AnnouncementHost() {
  const { unread, markAllSeen } = useAnnouncements();
  const a = unread[0];
  if (!a) return null;
  return createPortal(
    <div className="ann-overlay" role="dialog" aria-modal="true" aria-label="Aviso">
      <div className="ann-card">
        <span className="ann-ico"><Icon name="megaphone" size={26} strokeWidth={2.2} /></span>
        {a.author_label
          ? <span className="ann-by">{a.author_label}<VerifiedBadge /></span>
          : <small>Aviso do ALXmovies</small>}
        {a.author_label && <small>enviou um aviso</small>}
        <h2>{a.title}</h2>
        <p>{a.body}</p>
        <div className="ann-btns">
          {a.url && <button type="button" className="btn btn-primary" onClick={() => { markAllSeen(); void openExternal(a.url!); }}>Abrir</button>}
          <button type="button" className={a.url ? "btn btn-secondary" : "btn btn-primary"} onClick={markAllSeen}>Entendi</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
