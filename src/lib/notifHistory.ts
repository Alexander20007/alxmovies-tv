/** Histórico local das notificações (o servidor só devolve as pendentes; aqui guardamos as "antigas"). */
export type NotifKind = "friend_request" | "friend_accepted" | "stalled" | "sequel";

export interface StoredNotif {
  key: string;
  kind: NotifKind;
  text: string;
  /** quando a notificação apareceu pela primeira vez */
  ts: number;
  /** quando foi vista (some de "Novas" e vai para "Anteriores") */
  readAt?: number;
  mediaId?: number;
  mediaType?: "movie" | "tv";
  poster?: string | null;
  friendshipId?: string;
  from?: { id?: string; name: string; avatar?: string | null; color?: string | null };
}

const MAX_ITEMS = 60;
const MAX_AGE_MS = 60 * 86_400_000;
const storageKey = (pid: string) => `alx_notifs_v1:${pid}`;

const valid = (n: any): n is StoredNotif => !!n && typeof n.key === "string" && typeof n.text === "string" && typeof n.ts === "number";

export function trimHistory(list: StoredNotif[]): StoredNotif[] {
  const limit = Date.now() - MAX_AGE_MS;
  return list.filter((n) => n.ts >= limit).sort((a, b) => b.ts - a.ts).slice(0, MAX_ITEMS);
}

export function loadNotifHistory(pid: string): StoredNotif[] {
  try {
    const raw = localStorage.getItem(storageKey(pid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(valid) : [];
  } catch { return []; }
}

export function saveNotifHistory(pid: string, list: StoredNotif[]) {
  try { localStorage.setItem(storageKey(pid), JSON.stringify(trimHistory(list))); } catch { /* sem espaço / bloqueado */ }
}
