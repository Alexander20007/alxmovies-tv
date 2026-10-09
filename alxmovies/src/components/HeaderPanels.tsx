import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { SocAvatar } from "@/components/social/SocUi";
import { isNative } from "@/lib/native";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useFriendNotifications, useFriendships, useUnreadTotal } from "@/hooks/useSocialData";
import { isLive, messagePreview, timeAgo } from "@/lib/social";
import { markFriendNotificationsRead, respondToRequest } from "@/services/friends";
import { getContentNotifications } from "@/services/notifications";
import { posterUrl } from "@/services/tmdb";

export type PanelName = "bell" | "msgs" | "profile" | null;
interface PanelProps { open: boolean; toggle: () => void }

export function NotificationBell({ open, toggle }: PanelProps) {
  const { activeProfile } = useProfile();
  const { enabled } = useSocial();
  const qc = useQueryClient();
  const pid = activeProfile!.id;

  const content = useQuery({ queryKey: ["contentNotifs", pid], queryFn: () => getContentNotifications(pid), staleTime: 10 * 60_000 });
  const friend = useFriendNotifications();
  const [done, setDone] = useState<Record<string, "accepted" | "declined">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const wasOpen = useRef(false);

  const friendItems = (friend.data ?? []).filter((n) => done[n.friendshipId] !== "declined");
  const total = (enabled ? friendItems.filter((n) => !done[n.friendshipId]).length : 0) + (content.data?.length ?? 0);

  // Ao abrir marca "aceitou" como lido; ao fechar, tira da lista.
  useEffect(() => {
    if (open && !wasOpen.current && enabled && friend.data?.some((n) => n.kind === "friend_accepted")) {
      markFriendNotificationsRead(pid).catch(() => {});
    }
    if (!open && wasOpen.current) void qc.invalidateQueries({ queryKey: ["friendNotifs", pid] });
    wasOpen.current = open;
  }, [open, enabled, friend.data, pid, qc]);

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondToRequest(pid, id, accept),
    onSuccess: (_d, v) => {
      setDone((d) => ({ ...d, [v.id]: v.accept ? "accepted" : "declined" }));
      void qc.invalidateQueries({ queryKey: ["friendships", pid] });
    },
    onError: (e, v) => setErrors((x) => ({ ...x, [v.id]: e instanceof Error ? e.message : "Não foi possível agora." })),
  });

  const empty = !(enabled && friendItems.length) && !content.data?.length;

  return (
    <div className="header-bell" onClick={(e) => e.stopPropagation()}>
      <button type="button" id="header-bell-btn" aria-label="Notificações" onClick={toggle}>
        {isNative ? <Icon name="bell" /> : "🔔"}<span className="header-bell-dot" style={{ display: total > 0 ? "block" : "none" }} />
      </button>
      <div className={`header-bell-panel${open ? " open" : ""}`}>
        <div className="header-bell-title">Notificações</div>
        <div className="header-bell-list">
          {enabled && friendItems.map((n) => {
            const state = done[n.friendshipId];
            const avatar = <SocAvatar name={n.from.name} avatar={n.from.avatar} color={n.from.color} />;
            if (n.kind === "friend_accepted") {
              return <Link key={n.notificationId} className="header-bell-item bell-friend" to="/amigos">{avatar}<span>🎉 <b>{n.from.name}</b> aceitou seu pedido de amizade.</span></Link>;
            }
            return (
              <div key={n.notificationId} className="header-bell-item bell-friend">
                {avatar}
                <div className="bell-friend-body">
                  {state === "accepted" ? (
                    <>
                      <span>✅ Agora você e <b>{n.from.name}</b> são amigos.</span>
                      <div className="bell-actions"><Link className="bell-btn accept" to={`/mensagens?chat=${n.friendshipId}`}>Mandar mensagem</Link></div>
                    </>
                  ) : (
                    <>
                      <span>👋 <b>{n.from.name}</b> quer ser seu amigo.</span>
                      <div className="bell-actions">
                        <button type="button" className="bell-btn accept" disabled={respond.isPending} onClick={() => respond.mutate({ id: n.friendshipId, accept: true })}>Aceitar</button>
                        <button type="button" className="bell-btn" disabled={respond.isPending} onClick={() => respond.mutate({ id: n.friendshipId, accept: false })}>Recusar</button>
                      </div>
                      {errors[n.friendshipId] && <small className="bell-error">{errors[n.friendshipId]}</small>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {content.data?.map((n) => (
            <Link key={`${n.kind}-${n.id}`} className="header-bell-item" to={`/details?id=${n.id}&type=${n.media_type}`}>
              <img src={posterUrl(n.poster_path, "w92")} alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
              <span>{n.icon} {n.text}</span>
            </Link>
          ))}
          {empty && <p className="header-bell-empty">Nada novo por aqui.</p>}
        </div>
      </div>
    </div>
  );
}

export function MessagesButton({ open, toggle }: PanelProps) {
  const { enabled } = useSocial();
  const friends = useFriendships();
  const unread = useUnreadTotal();
  if (!enabled) return null;
  const n = unread.data ?? 0;

  return (
    <div className="header-msgs" onClick={(e) => e.stopPropagation()}>
      <button type="button" id="header-msgs-btn" aria-label="Mensagens" onClick={toggle}>
        {isNative ? <Icon name="chat" /> : "💬"}<span className="header-msgs-badge" style={{ display: n > 0 ? "flex" : "none" }}>{n > 99 ? "99+" : n}</span>
      </button>
      <div className={`header-msgs-panel${open ? " open" : ""}`}>
        <div className="header-bell-title">Mensagens</div>
        <div className="header-bell-list">
          {friends.isLoading && <p className="header-bell-empty">Carregando...</p>}
          {friends.isError && <p className="header-bell-empty">Não foi possível carregar agora.</p>}
          {friends.data && !friends.data.friends.length && (
            <>
              <p className="header-bell-empty">Você ainda não tem amigos por aqui.</p>
              <Link className="header-msgs-add" to="/amigos">➕ Adicionar amigos</Link>
            </>
          )}
          {friends.data?.friends.slice(0, 7).map((f) => (
            <Link key={f.friendship_id} className="header-bell-item msg-item" to={`/mensagens?chat=${f.friendship_id}`}>
              <SocAvatar name={f.friend_name} avatar={f.friend_avatar} color={f.friend_color} live={isLive(f)} />
              <div className="msg-item-body">
                <b>{f.friend_name}</b>
                <span className={`msg-preview ${f.unread_count > 0 ? "unread" : ""}`}>
                  {f.last_message_kind ? messagePreview(f.last_message_kind, f.last_message, f.last_message_mine) : "Toque pra iniciar a conversa"}
                </span>
              </div>
              <div className="msg-item-meta">
                {f.last_message_at && <small>{timeAgo(f.last_message_at)}</small>}
                {f.unread_count > 0 && <span className="msg-unread-pill">{f.unread_count}</span>}
              </div>
            </Link>
          ))}
        </div>
        <div className="header-msgs-foot"><Link to="/mensagens">Abrir mensagens</Link><Link to="/amigos">👥 Amigos</Link></div>
      </div>
    </div>
  );
}
