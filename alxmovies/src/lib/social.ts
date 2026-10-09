import type { FriendRow } from "@/services/friends";

export const formatFriendCode = (code?: string | null) => {
  const c = String(code ?? "").toUpperCase();
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};

const LIVE_WINDOW_MS = 150 * 1000; // o player avisa ~a cada 45s; 150s dá folga
export const isLive = (r?: Pick<FriendRow, "watching_title" | "watching_at"> | null) =>
  !!r?.watching_title && !!r.watching_at && Date.now() - new Date(r.watching_at).getTime() < LIVE_WINDOW_MS;

export function watchingLabel(r: FriendRow) {
  if (!r.watching_title) return "";
  if (r.watching_media_type === "tv" && r.watching_season != null && r.watching_episode != null) {
    return `${r.watching_title} · T${r.watching_season} E${r.watching_episode}`;
  }
  return r.watching_title;
}

export function watchAlongHref(r: FriendRow) {
  const base = `/watch?id=${r.watching_media_id}&type=${r.watching_media_type}`;
  return r.watching_media_type === "tv" && r.watching_season != null && r.watching_episode != null
    ? `${base}&s=${r.watching_season}&e=${r.watching_episode}` : base;
}

export function messagePreview(kind: string | null | undefined, body: string | null | undefined, mine?: boolean) {
  const prefix = mine ? "Você: " : "";
  if (kind === "title") return `${prefix}🎬 Indicou um título`;
  if (kind === "room") return `${prefix}👥 Convidou pra uma sala`;
  return `${prefix}${body || ""}`;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeInt = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export function parseTitlePayload(p: any) {
  const id = safeInt(p?.media_id);
  const type = p?.media_type === "tv" ? "tv" : p?.media_type === "movie" ? "movie" : null;
  if (!id || !type) return null;
  return { id, type: type as "tv" | "movie", title: String(p.title || "Título"), poster: p.poster_path ? String(p.poster_path) : null, year: p.year ? String(p.year).slice(0, 4) : "" };
}

export function parseRoomPayload(p: any) {
  const id = String(p?.room_id || "");
  if (!UUID_RE.test(id)) return null;
  return { id, title: String(p.title || "Sala"), movieTitle: String(p.movie_title || ""), poster: p.poster_path ? String(p.poster_path) : null };
}
