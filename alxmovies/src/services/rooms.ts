import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { MediaType } from "@/types";

export interface RoomRow {
  id: string;
  title: string;
  host_user_id: string;
  host_name: string;
  tmdb_id: number;
  media_type: MediaType;
  season: number | null;
  episode: number | null;
  movie_title: string;
  poster_path: string | null;
  is_private?: boolean;
  has_password?: boolean;
  is_playing: boolean;
  position_seconds: number;
  season_limit: number | null;
  created_at: string;
}

export interface QueueItem {
  id: string;
  room_id: string;
  tmdb_id: number;
  media_type: MediaType;
  season: number | null;
  episode: number | null;
  movie_title: string;
  poster_path: string | null;
  added_by_user_id: string;
  added_by_name: string;
  created_at: string;
}

export interface RoomMessage { id: string; room_id: string; user_id: string; display_name: string; message: string; created_at: string }
export interface PresenceUser { user_id: string; display_name: string; avatar_url?: string | null }

export interface CreateRoomInput {
  title: string; isPrivate: boolean; password?: string | null; tmdbId: number; mediaType: MediaType;
  season?: number | null; episode?: number | null; movieTitle: string; posterPath?: string | null;
  hostProfileId?: string | null; hostName: string; seasonLimit?: number | null;
}

const rpc = async <T = unknown>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
};

export const createRoom = (i: CreateRoomInput) =>
  rpc<RoomRow>("create_watch_room", {
    p_title: i.title, p_is_private: !!i.isPrivate, p_password: i.isPrivate ? i.password || null : null,
    p_tmdb_id: i.tmdbId, p_media_type: i.mediaType || "movie", p_season: i.season || null, p_episode: i.episode || null,
    p_movie_title: i.movieTitle, p_poster_path: i.posterPath || null, p_host_profile_id: i.hostProfileId || null,
    p_host_name: i.hostName, p_season_limit: i.seasonLimit || null,
  });

export const joinRoom = (roomId: string, password: string | null, displayName: string) =>
  rpc<RoomRow>("join_watch_room", { p_room_id: roomId, p_password: password || null, p_display_name: displayName });
export const advanceEpisode = (roomId: string, season: number, episode: number) =>
  rpc("advance_room_episode", { p_room_id: roomId, p_season: season, p_episode: episode });
export const updateRoomState = (roomId: string, isPlaying: boolean, positionSeconds: number) =>
  rpc("update_watch_room_state", { p_room_id: roomId, p_is_playing: isPlaying, p_position_seconds: positionSeconds });
export const closeRoom = (roomId: string) => rpc("close_watch_room", { p_room_id: roomId });
export const transferHost = (roomId: string, newHostUserId: string) =>
  rpc("transfer_room_host", { p_room_id: roomId, p_new_host_user_id: newHostUserId });
export const playFromQueue = (queueId: string) => rpc<RoomRow>("play_from_queue", { p_queue_id: queueId });

export async function claimHostIfAbandoned(roomId: string, onlineUserIds: string[]) {
  const data = await rpc<{ host_user_id: string; host_name: string }[]>("claim_room_host_if_abandoned", {
    p_room_id: roomId, p_online_user_ids: onlineUserIds,
  });
  return data?.[0] ?? null;
}

export async function listPublicRooms(): Promise<RoomRow[]> {
  const { data, error } = await supabase.from("watch_rooms_public").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RoomRow[];
}

export async function listMyRecentRooms(limit = 6): Promise<RoomRow[]> {
  const { data: memberships, error: e1 } = await supabase.from("watch_room_members")
    .select("room_id, joined_at").order("joined_at", { ascending: false }).limit(limit * 3);
  if (e1) throw e1;
  if (!memberships?.length) return [];
  const ids = [...new Set(memberships.map((m) => m.room_id))];
  const { data: rooms, error: e2 } = await supabase.from("watch_rooms_public").select("*").in("id", ids);
  if (e2) throw e2;
  const joinedAt = new Map<string, number>(memberships.map((m) => [m.room_id, new Date(m.joined_at).getTime()] as [string, number]));
  return ((rooms ?? []) as RoomRow[]).sort((a, b) => (joinedAt.get(b.id) ?? 0) - (joinedAt.get(a.id) ?? 0)).slice(0, limit);
}

export async function addToQueue(roomId: string, userId: string, userName: string, item: {
  tmdbId: number; mediaType: MediaType; season?: number | null; episode?: number | null; movieTitle: string; posterPath?: string | null;
}) {
  const { error } = await supabase.from("watch_room_queue").insert({
    room_id: roomId, tmdb_id: item.tmdbId, media_type: item.mediaType, season: item.season || null, episode: item.episode || null,
    movie_title: item.movieTitle, poster_path: item.posterPath || null, added_by_user_id: userId, added_by_name: userName,
  });
  if (error) throw error;
}

export async function loadQueue(roomId: string): Promise<QueueItem[]> {
  const { data, error } = await supabase.from("watch_room_queue").select("*").eq("room_id", roomId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QueueItem[];
}

export async function removeFromQueue(queueId: string) {
  const { error } = await supabase.from("watch_room_queue").delete().eq("id", queueId);
  if (error) throw error;
}

export async function sendMessage(roomId: string, userId: string, displayName: string, message: string) {
  const { data, error } = await supabase.from("watch_room_messages")
    .insert({ room_id: roomId, user_id: userId, display_name: displayName, message }).select().single();
  if (error) throw error;
  return data as RoomMessage;
}

export async function loadRecentMessages(roomId: string, limit = 50): Promise<RoomMessage[]> {
  const { data, error } = await supabase.from("watch_room_messages").select("*").eq("room_id", roomId)
    .order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  return (data ?? []) as RoomMessage[];
}

export interface ControlPayload { action: string; time: number; at?: number; [k: string]: any }
export interface RoomCallbacks {
  onControl?: (p: ControlPayload) => void;
  onMessage?: (row: RoomMessage) => void;
  onPresence?: (list: PresenceUser[]) => void;
  onQueueAdd?: (row: QueueItem) => void;
  onQueueRemove?: (row: QueueItem) => void;
  onConnectionChange?: (status: string) => void;
}

/** Canal Realtime da sala: broadcast de controle, chat, fila e presença. */
export function subscribeToRoom(roomId: string, userId: string, displayName: string, cb: RoomCallbacks, avatarUrl: string | null = null) {
  const channel: RealtimeChannel = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId } } });
  const table = (t: string, event: "INSERT" | "DELETE", fn: (p: any) => void) =>
    channel.on("postgres_changes" as any, { event, schema: "public", table: t, filter: `room_id=eq.${roomId}` }, fn);

  channel.on("broadcast", { event: "control" }, ({ payload }) => cb.onControl?.(payload as ControlPayload));
  table("watch_room_messages", "INSERT", (p) => cb.onMessage?.(p.new));
  table("watch_room_queue", "INSERT", (p) => cb.onQueueAdd?.(p.new));
  table("watch_room_queue", "DELETE", (p) => cb.onQueueRemove?.(p.old));
  channel.on("presence", { event: "sync" }, () => {
    cb.onPresence?.(Object.values(channel.presenceState()).flat() as unknown as PresenceUser[]);
  });
  channel.subscribe(async (status) => {
    cb.onConnectionChange?.(status);
    if (status === "SUBSCRIBED") {
      await channel.track({ user_id: userId, display_name: displayName, avatar_url: avatarUrl, online_at: Date.now() });
    }
  });

  return {
    broadcastControl(action: string, time: number, extra: Record<string, unknown> = {}) {
      void channel.send({ type: "broadcast", event: "control", payload: { action, time, at: Date.now(), ...extra } });
    },
    unsubscribe() { void supabase.removeChannel(channel); },
  };
}
export type RoomChannel = ReturnType<typeof subscribeToRoom>;
