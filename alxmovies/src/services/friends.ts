import { supabase } from "@/lib/supabase";
import { isLive } from "@/lib/social";

export class SocialError extends Error { code?: string }

function friendly(error: { message?: string; code?: string }) {
  const raw = error?.message || "";
  const e = new SocialError(raw || "Algo deu errado. Tente de novo.");
  e.code = error?.code;
  if (error?.code === "PGRST202" || error?.code === "PGRST203" || /could not find the function|best candidate function/i.test(raw)) {
    e.message = `Banco de dados incompleto: ${raw} — rode de novo as partes 1 a 7 da pasta sql/amigos no Supabase (em ordem) e confira se o resultado da parte 7 mostra tudo "ok".`;
    e.code = "NOT_INSTALLED";
  } else if (error?.code === "42P01") {
    e.message = `Banco de dados com sobra de instalação antiga: ${raw}. Rode o sql/friends-corrigir-social-privacy.sql.`;
    e.code = "OLD_LEFTOVER";
  }
  return e;
}

async function rpc<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw friendly(error);
  return data as T;
}

export interface SocialSettings { friend_code: string; show_watching: boolean; friends_enabled: boolean; accept_requests: boolean }
export interface FriendRow {
  friendship_id: string;
  direction: "friend" | "incoming" | "outgoing" | "blocked";
  friend_name: string; friend_avatar?: string | null; friend_color?: string | null;
  created_at: string;
  last_message?: string | null; last_message_kind?: string | null; last_message_at?: string | null; last_message_mine?: boolean;
  unread_count: number;
  watching_title?: string | null; watching_at?: string | null; watching_media_id?: number | null;
  watching_media_type?: "movie" | "tv" | null; watching_season?: number | null; watching_episode?: number | null;
}
export interface FriendMessage {
  id: string; friendship_id: string; sender_id: string; kind: "text" | "title" | "room";
  body: string; payload: any; created_at: string; read_at: string | null;
}
export interface FriendNotification {
  kind: "friend_request" | "friend_accepted"; notificationId: string; friendshipId: string;
  from: { id: string; name: string; avatar?: string | null; color?: string | null }; createdAt: string;
}

export const getSocialSettings = (profileId: string) => rpc<SocialSettings>("social_ensure_settings", { p_profile_id: profileId });
export function updateSocialSettings(profileId: string, patch: Partial<Pick<SocialSettings, "show_watching" | "friends_enabled" | "accept_requests">>) {
  const args: Record<string, unknown> = { p_profile_id: profileId };
  if (patch.show_watching != null) args.p_show_watching = patch.show_watching;
  if (patch.friends_enabled != null) args.p_friends_enabled = patch.friends_enabled;
  if (patch.accept_requests != null) args.p_accept_requests = patch.accept_requests;
  presence.enabled = undefined; // reavalia no próximo batimento
  return rpc<SocialSettings>("social_update_settings", args);
}
export const regenerateFriendCode = (profileId: string) => rpc<SocialSettings>("social_regenerate_code", { p_profile_id: profileId });

export const sendFriendRequest = (profileId: string, code: string) => rpc("social_send_request", { p_from_profile_id: profileId, p_code: code });
export const respondToRequest = (profileId: string, friendshipId: string, accept: boolean) =>
  rpc("social_respond_request", { p_profile_id: profileId, p_friendship_id: friendshipId, p_accept: !!accept });
export const removeFriendship = (profileId: string, id: string) => rpc("social_remove_friend", { p_profile_id: profileId, p_friendship_id: id });
export const blockFriendship = (profileId: string, id: string) => rpc("social_block", { p_profile_id: profileId, p_friendship_id: id });
export const unblockFriendship = (profileId: string, id: string) => rpc("social_unblock", { p_profile_id: profileId, p_friendship_id: id });

export async function listFriendships(profileId: string) {
  const rows = (await rpc<FriendRow[]>("social_list", { p_profile_id: profileId })) || [];
  const byDate = (a: FriendRow, b: FriendRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const friends = rows.filter((r) => r.direction === "friend").sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    if (ta !== tb) return tb - ta;
    const la = isLive(a) ? 1 : 0, lb = isLive(b) ? 1 : 0;
    if (la !== lb) return lb - la;
    return String(a.friend_name).localeCompare(String(b.friend_name), "pt-BR");
  });
  return {
    friends,
    incoming: rows.filter((r) => r.direction === "incoming").sort(byDate),
    outgoing: rows.filter((r) => r.direction === "outgoing").sort(byDate),
    blocked: rows.filter((r) => r.direction === "blocked").sort(byDate),
  };
}

// ---------- "assistindo agora" ----------
const presence: { profileId: string | null; enabled: boolean | undefined; lastSent: number } = { profileId: null, enabled: undefined, lastSent: 0 };

async function presenceEnabled(profileId: string) {
  if (presence.profileId !== profileId) Object.assign(presence, { profileId, enabled: undefined, lastSent: 0 });
  if (presence.enabled === undefined) {
    try {
      const s = await getSocialSettings(profileId);
      presence.enabled = !!(s.show_watching && s.friends_enabled);
    } catch { presence.enabled = false; }
  }
  return presence.enabled;
}

export async function announceWatching(
  profileId: string,
  info: { mediaId: number; mediaType: "movie" | "tv"; title?: string; posterPath?: string | null; season?: number | null; episode?: number | null },
  force = false
) {
  if (!(await presenceEnabled(profileId))) return;
  const now = Date.now();
  if (!force && now - presence.lastSent < 45000) return;
  presence.lastSent = now;
  try {
    await rpc("social_set_watching", {
      p_profile_id: profileId, p_media_id: info.mediaId, p_media_type: info.mediaType, p_title: info.title || "Sem título",
      p_poster_path: info.posterPath || null, p_season: info.season ?? null, p_episode: info.episode ?? null,
    });
  } catch { /* presença é "melhor esforço" */ }
}

export async function stopWatching() {
  if (presence.enabled !== true || !presence.profileId) return;
  presence.lastSent = 0;
  try { await rpc("social_clear_watching", { p_profile_id: presence.profileId }); } catch { /* expira sozinho */ }
}

// ---------- mensagens ----------
export const sendFriendMessage = (profileId: string, friendshipId: string, body: string, kind: "text" | "title" | "room" = "text", payload: unknown = null) => {
  const args: Record<string, unknown> = { p_profile_id: profileId, p_friendship_id: friendshipId, p_body: body || "", p_kind: kind };
  if (payload) args.p_payload = payload;
  return rpc<FriendMessage>("social_send_message", args);
};

export async function getFriendMessages(friendshipId: string, opts: { before?: string | null; limit?: number } = {}) {
  let q = supabase.from("friend_messages").select("*").eq("friendship_id", friendshipId).order("created_at", { ascending: false }).limit(opts.limit ?? 50);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) throw friendly(error);
  return ((data ?? []) as FriendMessage[]).reverse();
}

export const markConversationRead = (profileId: string, friendshipId: string) =>
  rpc("social_mark_read", { p_profile_id: profileId, p_friendship_id: friendshipId });
export async function getUnreadTotal(profileId: string) {
  return Number(await rpc("social_unread_total", { p_profile_id: profileId })) || 0;
}

export async function getFriendNotifications(profileId: string): Promise<FriendNotification[]> {
  const rows = (await rpc<any[]>("social_get_notifications", { p_profile_id: profileId })) || [];
  return rows.map((r) => ({
    kind: r.kind, notificationId: r.id, friendshipId: r.friendship_id,
    from: { id: r.from_id, name: r.from_name, avatar: r.from_avatar, color: r.from_color }, createdAt: r.created_at,
  }));
}
export const markFriendNotificationsRead = (profileId: string) => rpc("social_mark_notifications_read", { p_profile_id: profileId });
