import type { NavigateFunction } from "react-router-dom";
import type { LauraAction } from "@/services/gemini";
import type { Profile, MediaItem, MediaType } from "@/types";
import { isAllowedForProfile } from "@/lib/contentFilter";
import { getLastEpisode } from "@/lib/media";
import { isNative, shareLink } from "@/lib/native";
import { findChannelFuzzy, getChannelProgramGuide, type Channel } from "@/services/channels";
import { addFavorite, fetchContinueWatching, removeFavorite } from "@/services/library";
import { listPublicRooms } from "@/services/rooms";
import { setMovieWatched } from "@/services/seen";
import { setRating } from "@/services/social";
import { tmdb } from "@/services/tmdb";

export interface Ctx {
  profile: Profile;
  navigate: NavigateFunction;
  openPlayer: (c: Channel, list?: Channel[]) => void;
  openPanel: () => void;
}
export interface MatchCard { id: number; type: MediaType; name: string; poster: string | null; year: string; overview: string; voteAverage: number; voteCount: number }
export interface Outcome {
  /** false = não deu para resolver aqui (o app cai para a IA). */
  handled: boolean;
  message?: string;
  tone?: "ok" | "warn";
  /** Ação de tela (abrir player, detalhes…). Executada pela tela depois que a resposta aparece. */
  navigate?: () => void;
  match?: MatchCard;
  channels?: Channel[];
}

// ───────────────────────── texto ─────────────────────────
export const normalize = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["o", "a", "os", "as", "de", "do", "da", "dos", "das", "e", "um", "uma", "the", "of", "em", "no", "na"]);
const tokens = (t: string) => normalize(t).split(" ").filter((w) => w && !STOP.has(w));

/** Quanto do que foi pedido aparece no título (0 a 1). */
function similarity(query: string, title: string): number {
  const q = tokens(query), t = new Set(tokens(title));
  if (!q.length) return 0;
  return q.filter((w) => t.has(w)).length / q.length;
}

// ───────────────────────── resolver título ─────────────────────────
type Resolved = { kind: "ok"; hit: MediaItem; type: MediaType; card: MatchCard } | { kind: "blocked"; name: string } | { kind: "none" };

export async function resolveTitle(ref: { title: string; year?: string; mediaType?: "movie" | "tv" }, profile: Profile): Promise<Resolved> {
  try {
    const { results } = await tmdb.search(ref.title, ref.mediaType ?? "multi");
    const cands = results.filter((r) => (r.media_type ?? ref.mediaType) === "movie" || (r.media_type ?? ref.mediaType) === "tv");
    const scored = cands.map((r) => {
      const names = [r.title, r.name, (r as any).original_title, (r as any).original_name].filter(Boolean) as string[];
      let s = Math.max(...names.map((n) => similarity(ref.title, n)), 0);
      const exact = names.some((n) => normalize(n) === normalize(ref.title));
      if (exact) s += 0.5;
      const year = (r.release_date ?? r.first_air_date ?? "").slice(0, 4);
      if (ref.year && year === ref.year) s += 0.3;
      s += Math.min(0.15, ((r as any).popularity ?? 0) / 2000);
      return { r, s };
    }).filter((x) => x.s >= 0.6).sort((a, b) => b.s - a.s);
    if (!scored.length) return { kind: "none" };
    const hit = scored[0].r;
    const type = ((hit.media_type ?? ref.mediaType) === "tv" ? "tv" : "movie") as MediaType;
    const name = hit.title ?? hit.name ?? ref.title;
    if (!isAllowedForProfile(hit, profile)) return { kind: "blocked", name };
    return {
      kind: "ok", hit, type,
      card: { id: hit.id, type, name, poster: hit.poster_path, year: (hit.release_date ?? hit.first_air_date ?? "").slice(0, 4), overview: hit.overview ?? "", voteAverage: hit.vote_average ?? 0, voteCount: (hit as any).vote_count ?? 0 },
    };
  } catch { return { kind: "none" }; }
}

const watchUrl = (card: MatchCard, profile: Profile, season?: number | null, episode?: number | null) => {
  if (card.type !== "tv") return `/watch?id=${card.id}&type=movie`;
  const last = getLastEpisode(profile.id, card.id);
  const s = season ?? (episode ? 1 : last?.season ?? 1);
  const e = episode ?? (season ? 1 : last?.episode ?? 1);
  return `/watch?id=${card.id}&type=tv&s=${s}&e=${e}`;
};

const SCREENS: Record<string, { label: string; go: (c: Ctx, q?: string) => void }> = {
  home: { label: "o início", go: (c) => c.navigate("/home") },
  list: { label: "a sua lista", go: (c) => c.navigate("/mylist") },
  search: { label: "a busca", go: (c, q) => c.navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search") },
  channels: { label: "os canais ao vivo", go: (c) => c.openPanel() },
  rooms: { label: "as salas", go: (c) => c.navigate("/salas") },
  friends: { label: "os amigos", go: (c) => c.navigate("/amigos") },
  messages: { label: "as mensagens", go: (c) => c.navigate("/mensagens") },
  notifications: { label: "as notificações", go: (c) => c.navigate("/notificacoes") },
  account: { label: "a sua conta", go: (c) => c.navigate("/account") },
};

const hhmm = (iso: string | null) => (iso && !isNaN(new Date(iso).getTime()) ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");

// ───────────────────────── executar ─────────────────────────
export async function runAction(a: LauraAction, ctx: Ctx): Promise<Outcome> {
  const { profile, navigate } = ctx;

  if (a.type === "goto") {
    const sc = SCREENS[a.screen];
    return sc ? { handled: true, message: `Abrindo ${sc.label}…`, tone: "ok", navigate: () => sc.go(ctx, a.query) } : { handled: false };
  }

  if (a.type === "continue") {
    const items = await fetchContinueWatching(profile.id, 1).catch(() => []);
    const it = items[0];
    if (!it) return { handled: true, message: "Você não tem nada para continuar agora. Que tal começar algo novo?", tone: "warn" };
    const type = it.media_type as MediaType;
    const card: MatchCard = { id: it.media_id, type, name: it.title ?? "", poster: it.poster_path ?? null, year: "", overview: "", voteAverage: 0, voteCount: 0 };
    return { handled: true, message: `Continuando ${card.name}…`, tone: "ok", match: card, navigate: () => navigate(watchUrl(card, profile)) };
  }

  if (a.type === "play_channel" || a.type === "channel_now") {
    const found = await findChannelFuzzy(a.name);
    if (!found) return { handled: a.type === "channel_now" ? true : false, message: `Não encontrei o canal "${a.name}".`, tone: "warn" };
    const { channel, siblings } = found;
    if (a.type === "play_channel") {
      return { handled: true, message: `Abrindo ${channel.name} ao vivo…`, tone: "ok", channels: [channel], navigate: () => ctx.openPlayer(channel, [channel, ...siblings]) };
    }
    const g = await getChannelProgramGuide(channel.stream).catch(() => null);
    const msg = g?.atual
      ? `Agora no **${channel.name}**: **${g.atual.titulo}**${hhmm(g.atual.inicio) ? ` (${hhmm(g.atual.inicio)}–${hhmm(g.atual.fim)})` : ""}.${g.proximo ? ` A seguir: **${g.proximo.titulo}**.` : ""}`
      : `Não tenho a programação do ${channel.name} agora, mas você pode assistir ao vivo.`;
    return { handled: true, message: msg, tone: "ok", channels: [channel] };
  }

  if (a.type === "join_room") {
    const rooms = await listPublicRooms().catch(() => []);
    const room = rooms.find((r) => similarity(a.name, r.title) >= 0.6 || similarity(a.name, r.movie_title) >= 0.8);
    if (!room) return { handled: true, message: `Não achei uma sala ativa com o nome "${a.name}".`, tone: "warn" };
    return { handled: true, message: `Entrando na sala ${room.title}…`, tone: "ok", navigate: () => navigate(`/sala?id=${room.id}`) };
  }

  if (a.type === "person") {
    try {
      const { results } = await tmdb.search(a.name, "multi");
      const p = results.find((r) => r.media_type === "person");
      if (!p) return { handled: true, message: `Não encontrei "${a.name}".`, tone: "warn" };
      return { handled: true, message: `Abrindo a página de ${p.name ?? a.name}…`, tone: "ok", navigate: () => navigate(`/person?id=${p.id}`) };
    } catch { return { handled: true, message: "Não consegui buscar essa pessoa agora.", tone: "warn" }; }
  }

  // ---- ações sobre um título ----
  const ref = a as { title: string; year?: string; mediaType?: "movie" | "tv" };
  const r = await resolveTitle(ref, profile);
  if (r.kind === "blocked") return { handled: true, message: `"${r.name}" não está liberado para este perfil.`, tone: "warn" };
  if (r.kind === "none") return { handled: false, message: `Não encontrei "${ref.title}" no catálogo.`, tone: "warn" };
  const { card, hit, type } = r;

  switch (a.type) {
    case "play":
      return { handled: true, message: `Abrindo ${card.name}${type === "tv" && a.season ? ` — T${a.season}${a.episode ? ` E${a.episode}` : ""}` : ""}…`, tone: "ok", match: card, navigate: () => navigate(watchUrl(card, profile, a.season, a.episode)) };
    case "open_details":
      return { handled: true, message: `Abrindo ${card.name}…`, tone: "ok", match: card, navigate: () => navigate(`/details?id=${card.id}&type=${type}`) };
    case "trailer":
      return { handled: true, message: `Abrindo o trailer de ${card.name}…`, tone: "ok", match: card, navigate: () => navigate(`/details?id=${card.id}&type=${type}&trailer=1`) };
    case "download":
      if (!isNative) return { handled: true, message: "Baixar só funciona no app do ALXmovies para Android.", tone: "warn", match: card };
      return { handled: true, message: `Preparando o download de ${card.name}…`, tone: "ok", match: card, navigate: () => navigate(`/details?id=${card.id}&type=${type}&download=1`) };
    case "create_room":
      return { handled: true, message: `Vamos criar uma sala para ${card.name}…`, tone: "ok", match: card, navigate: () => navigate(`/salas?${new URLSearchParams({ tmdbId: String(card.id), mediaType: type, title: card.name, poster: card.poster ?? "" })}`) };
    case "add_to_list":
      await addFavorite(profile.id, type, hit as any);
      return { handled: true, message: `✓ ${card.name} foi para a sua lista.`, tone: "ok", match: card };
    case "remove_from_list":
      await removeFavorite(profile.id, card.id, type);
      return { handled: true, message: `✓ ${card.name} saiu da sua lista.`, tone: "ok" };
    case "mark_watched":
      if (type !== "movie") return { handled: true, message: `${card.name} é uma série: marque os episódios vistos na tela de episódios.`, tone: "warn", match: card, navigate: () => navigate(`/episodes?id=${card.id}`) };
      await setMovieWatched(profile.id, { media_id: card.id, title: card.name, poster_path: card.poster }, true);
      return { handled: true, message: `✓ ${card.name} marcado como visto.`, tone: "ok", match: card };
    case "rate":
      await setRating(profile.id, card.id, type, card.name, a.rating);
      return { handled: true, message: `✓ ${a.rating === "loved" ? "Amei" : a.rating === "liked" ? "Gostei" : "Não gostei"} — ${card.name}.`, tone: "ok", match: card };
    case "share": {
      const url = `${window.location.origin}/details?id=${card.id}&type=${type}`;
      await shareLink({ title: `${card.name} — ALXmovies`, url });
      return { handled: true, message: `Compartilhando ${card.name}…`, tone: "ok", match: card };
    }
    default:
      return { handled: false };
  }
}

// ───────────────────────── atalho local (sem IA) ─────────────────────────
/**
 * Comandos diretos ("reproduzir X", "abrir o canal Globo", "continuar de onde parei"…) são entendidos aqui mesmo:
 * é instantâneo e funciona até se a IA estiver fora do ar. Frases abertas (pedidos de recomendação) retornam null e vão para a IA.
 */
export function parseLocalIntent(raw: string): LauraAction | null {
  const t = normalize(raw);
  if (!t || t.length < 3) return null;
  if (/\b(algo|alguma|algum|qual|quais|recomend\w*|sugir\w*|sugest\w*|parecid\w*|melhor|melhores|indic\w*|como|porque|quem|onde fica|quando|que filme|que serie)\b/.test(t) || /\?\s*$/.test(raw.trim())) return null;

  if (/\bcontinu\w+\b.*\b(onde|parei|assistindo|assistir)\b|\bonde (eu )?parei\b|\bretomar\b/.test(t)) return { type: "continue" };

  // atalhos de tela
  const screen = t.match(/^(?:por favor )?(?:abr\w+|ir|va|vai|ver|mostr\w+|me leva|leva)\s+(?:para |pra |a |o |as |os |meus |minha |minhas |meu )*(lista|salas?|canais|tv ao vivo|amigos|mensagens|chat|notificacoes|buscar|busca|pesquisar|inicio|home|tela inicial|conta|perfil)$/);
  if (screen) {
    const k = screen[1];
    const map: Record<string, any> = { lista: "list", sala: "rooms", salas: "rooms", canais: "channels", "tv ao vivo": "channels", amigos: "friends", mensagens: "messages", chat: "messages", notificacoes: "notifications", buscar: "search", busca: "search", pesquisar: "search", inicio: "home", home: "home", "tela inicial": "home", conta: "account", perfil: "account" };
    return { type: "goto", screen: map[k] };
  }

  let m = t.match(/^(?:por favor )?(?:adicion\w+|coloc\w+|salv\w+|bota\w*)\s+(.+?)\s+(?:na|a|em|para a|pra)\s+(?:minha\s+)?lista$/);
  if (m) return { type: "add_to_list", title: clean(m[1]) };
  m = t.match(/^(?:por favor )?(?:remov\w+|tir\w+|exclu\w+)\s+(.+?)\s+(?:da|de)\s+(?:minha\s+)?lista$/);
  if (m) return { type: "remove_from_list", title: clean(m[1]) };
  m = t.match(/^(?:por favor )?marc\w+\s+(.+?)\s+como\s+(?:visto|assistido)$/);
  if (m) return { type: "mark_watched", title: clean(m[1]) };
  m = t.match(/^(?:por favor )?(?:mostr\w+|ver|abr\w+|quero ver|reproduz\w+)\s+(?:o\s+)?trailer\s+(?:de|do|da|dos|das)\s+(.+)$/);
  if (m) return { type: "trailer", title: clean(m[1]) };
  m = t.match(/^(?:por favor )?(?:baix\w+|download)\s+(?:o\s+|a\s+)?(?:filme\s+|serie\s+)?(.+)$/);
  if (m) return { type: "download", title: clean(m[1]) };
  m = t.match(/^(?:por favor )?(?:cri\w+)\s+(?:uma\s+)?sala\s+(?:para|pra)\s+(?:assistir\s+)?(.+)$/);
  if (m) return { type: "create_room", title: clean(m[1]) };

  // reproduzir / abrir canal
  m = t.match(/^(?:por favor )?(?:eu\s+)?(?:quero\s+|queria\s+|vou\s+|preciso\s+)?(?:que\s+voce\s+)?(?:reproduz\w*|reproduza|assist\w+|colo\w+|toc\w+|abr\w+|ponh\w+|poe|bota\w*|da play em|dar play em|play)\s+(?:no\s+|na\s+|o\s+|a\s+|os\s+|as\s+|um\s+|uma\s+|pra mim\s+)*(?:(canal|filme|serie|series|novela|programa)\s+)?(.+)$/);
  if (m) {
    const kind = m[1] ?? "";
    let title = clean(m[2]);
    if (!title) return null;
    if (kind === "canal") return { type: "play_channel", name: title };
    // "assistir globo ao vivo" / "assistir ao vivo a globo"
    const live = title.match(/^(?:ao vivo\s+)?(?:a\s+|o\s+)?(.+?)(?:\s+ao vivo)?$/);
    if (/\bao vivo\b/.test(t) && live) return { type: "play_channel", name: live[1] };
    let season: number | null = null, episode: number | null = null;
    const se = title.match(/\bs(\d{1,2})\s*e(\d{1,3})\b/) || title.match(/\bt(\d{1,2})\s*e(\d{1,3})\b/);
    if (se) { season = Number(se[1]); episode = Number(se[2]); title = clean(title.replace(se[0], " ")); }
    const ts = title.match(/\b(?:temporada|temp)\s*(\d{1,2})\b/);
    if (ts) { season = Number(ts[1]); title = clean(title.replace(ts[0], " ")); }
    const te = title.match(/\b(?:episodio|ep)\s*(\d{1,3})\b/);
    if (te) { episode = Number(te[1]); title = clean(title.replace(te[0], " ")); }
    if (!title) return null;
    return { type: "play", title, mediaType: kind === "filme" ? "movie" : kind ? "tv" : undefined, season, episode };
  }
  return null;
}

function clean(s: string) {
  return s.replace(/\b(por favor|agora|pra mim|para mim|ai|ae|ok)\b/g, " ").replace(/\s+/g, " ").trim();
}
