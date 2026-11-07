import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useFriendNotifications } from "@/hooks/useSocialData";
import { loadNotifHistory, saveNotifHistory, trimHistory, type StoredNotif } from "@/lib/notifHistory";
import { getContentNotifications } from "@/services/notifications";
import { useAnnouncements } from "@/hooks/useAnnouncements";

/**
 * Junta as notificações atuais (pedidos de amizade, "aceitou", "você parou em…", sequências)
 * com o histórico local: o que ainda não foi visto é "novo", o resto vira "anterior".
 */
export function useNotificationFeed() {
  const { activeProfile } = useProfile();
  const { enabled } = useSocial();
  const pid = activeProfile?.id ?? "";

  const content = useQuery({
    queryKey: ["contentNotifs", pid],
    queryFn: () => getContentNotifications(pid),
    enabled: !!pid,
    staleTime: 10 * 60_000,
  });
  const friend = useFriendNotifications();
  const ann = useAnnouncements();

  const [store, setStore] = useState<StoredNotif[]>(() => (pid ? loadNotifHistory(pid) : []));
  useEffect(() => { setStore(pid ? loadNotifHistory(pid) : []); }, [pid]);
  // sempre o valor mais recente (as funções abaixo também rodam quando a tela está fechando)
  const storeRef = useRef(store);
  storeRef.current = store;
  const commit = useCallback((next: StoredNotif[]) => {
    const trimmed = trimHistory(next);
    storeRef.current = trimmed;
    if (pid) saveNotifHistory(pid, trimmed);
    setStore(trimmed);
  }, [pid]);

  const current = useMemo<StoredNotif[]>(() => {
    const out: StoredNotif[] = [];
    if (enabled) {
      (friend.data ?? []).forEach((n) => out.push({
        key: `f:${n.notificationId}`, kind: n.kind,
        text: n.kind === "friend_request" ? `${n.from.name} quer ser seu amigo.` : `${n.from.name} aceitou seu pedido de amizade.`,
        ts: new Date(n.createdAt).getTime() || 0, friendshipId: n.friendshipId, from: n.from,
      }));
    }
    (content.data ?? []).forEach((n) => out.push({
      key: `c:${n.kind}:${n.id}`, kind: n.kind, text: n.text, ts: 0, mediaId: n.id, mediaType: n.media_type, poster: n.poster_path,
    }));
    return out;
  }, [enabled, friend.data, content.data]);

  // guarda no histórico tudo o que aparecer pela primeira vez
  useEffect(() => {
    if (!pid || !current.length) return;
    const prev = storeRef.current;
    const known = new Set(prev.map((p) => p.key));
    const added = current.filter((c) => !known.has(c.key)).map((c) => ({ ...c, ts: c.ts || Date.now() }));
    if (added.length) commit([...prev, ...added]);
  }, [current, pid, commit]);

  const { fresh, older } = useMemo(() => {
    const byKey = new Map(store.map((s) => [s.key, s]));
    const now = Date.now();
    const fresh: StoredNotif[] = current
      .filter((c) => !byKey.get(c.key)?.readAt)
      .map((c) => {
        const saved = byKey.get(c.key);
        return { ...c, ...saved, ts: saved?.ts ?? (c.ts || now) };
      })
      .sort((a, b) => b.ts - a.ts);
    const freshKeys = new Set(fresh.map((f) => f.key));
    const older = store.filter((s) => !freshKeys.has(s.key)).sort((a, b) => b.ts - a.ts);
    return { fresh, older };
  }, [current, store]);

  /** Marca as novas como vistas (pedidos de amizade pendentes continuam em "Novas" até serem respondidos). */
  const markAllRead = useCallback(() => {
    if (!pid) return;
    const now = Date.now();
    const map = new Map(storeRef.current.map((p) => [p.key, p]));
    let changed = false;
    current.forEach((c) => {
      if (c.kind === "friend_request") return;
      const old = map.get(c.key) ?? { ...c, ts: c.ts || now };
      if (!old.readAt) { map.set(c.key, { ...old, readAt: now }); changed = true; }
    });
    if (changed) commit([...map.values()]);
  }, [current, pid, commit]);

  /** Depois de aceitar/recusar um pedido: vira uma linha de histórico com o resultado. */
  const resolve = useCallback((key: string, text: string) => {
    if (!pid) return;
    const now = Date.now();
    const prev = storeRef.current;
    const base = prev.find((p) => p.key === key) ?? current.find((c) => c.key === key);
    if (!base) return;
    commit([...prev.filter((p) => p.key !== key), { ...base, text, readAt: now, ts: base.ts || now }]);
  }, [current, pid, commit]);

  return {
    fresh, older,
    unreadCount: fresh.length + ann.unread.length,
    loading: content.isLoading || (enabled && friend.isLoading),
    markAllRead, resolve,
  };
}
