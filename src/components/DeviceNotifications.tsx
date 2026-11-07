import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { CONFIG } from "@/lib/config";
import { deviceNotify } from "@/lib/deviceNotify";
import { isNative } from "@/lib/native";
import { messagePreview } from "@/lib/social";
import { registerPushToken } from "@/lib/pushToken";
import { supabase } from "@/lib/supabase";
import { getFriendNotifications, listFriendships, type FriendMessage } from "@/services/friends";

/**
 * Notificações do aparelho (só no app Android): mensagem nova e pedido de amizade aparecem na barra de notificações
 * quando o app está em segundo plano, e dá para responder / aceitar / recusar pela própria notificação.
 * Não renderiza nada.
 */
export function DeviceNotifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();
  const { available, enabled, loading, on } = useSocial();
  const pid = activeProfile?.id;
  const active = isNative && available && enabled && !!pid;
  const shown = useRef(new Set<string>());

  // Toque numa notificação → abre a tela certa
  useEffect(() => deviceNotify.onTap((e) => {
    if (e.kind === "message" && e.fid) navigate(`/mensagens?chat=${encodeURIComponent(e.fid)}`);
    else if (e.kind === "friend_request") navigate("/notificacoes");
    else if (e.kind === "friend_accepted") navigate("/amigos");
    else if (e.kind === "app_update") window.dispatchEvent(new Event("alx:check-update"));
  }), [navigate]);

  // Permissão de notificações (Android 13+): pede assim que há uma conta real logada, sem depender de amigos estarem ligados
  useEffect(() => {
    if (isNative && available) void deviceNotify.requestPermission();
  }, [available]);

  // Login guardado no aparelho (os botões da notificação usam ele para enviar sem abrir o app)
  useEffect(() => {
    if (!isNative) return;
    if (!active) {
      if (!available || (!loading && !enabled)) void deviceNotify.clearSession();
      return;
    }
    void registerPushToken(pid!);
    const push = (token?: string) => {
      if (token) void deviceNotify.setSession({ url: CONFIG.SUPABASE_URL, key: CONFIG.SUPABASE_ANON_KEY, token, proxy: CONFIG.USE_PROXY ? CONFIG.PROXY_URL : "" });
      else void deviceNotify.clearSession();
    };
    void supabase.auth.getSession().then(({ data }) => push(data.session?.access_token));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => push(s?.access_token));
    return () => sub.subscription.unsubscribe();
  }, [active, available, enabled, loading, pid]);

  // Ao abrir o app, limpa o que já está na barra (o app mostra tudo por dentro)
  useEffect(() => {
    if (!isNative) return;
    const onVisible = () => { if (document.visibilityState === "visible") void deviceNotify.cancelAll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Eventos em tempo real → notificação (só com o app fora da tela)
  useEffect(() => {
    if (!active || !pid) return;
    const hidden = () => document.visibilityState !== "visible";

    const offMessage = on("message", async (m: FriendMessage) => {
      if (!m || m.sender_id === pid || !hidden() || shown.current.has(`m:${m.id}`)) return;
      shown.current.add(`m:${m.id}`);
      try {
        const list = await qc.fetchQuery({ queryKey: ["friendships", pid], queryFn: () => listFriendships(pid), staleTime: 30_000 });
        const friend = list.friends.find((f) => f.friendship_id === m.friendship_id);
        if (!friend) return;
        await deviceNotify.showMessage({
          fid: m.friendship_id, pid, name: friend.friend_name, mid: m.id,
          text: messagePreview(m.kind, m.body), ts: new Date(m.created_at).getTime() || Date.now(),
        });
      } catch { /* sem notificação desta vez */ }
    });

    const offFriend = on("notification", async (n: { id?: string }) => {
      if (!n?.id || !hidden() || shown.current.has(`n:${n.id}`)) return;
      shown.current.add(`n:${n.id}`);
      try {
        const item = (await getFriendNotifications(pid)).find((x) => x.notificationId === n.id);
        if (!item) return;
        await deviceNotify.showFriendEvent({ kind: item.kind, fid: item.friendshipId, pid, name: item.from.name, nid: item.notificationId });
      } catch { /* sem notificação desta vez */ }
    });

    return () => { offMessage(); offFriend(); };
  }, [active, pid, on, qc]);

  return null;
}
