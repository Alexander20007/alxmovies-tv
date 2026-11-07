import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNative } from "./native";

export type DlStatus = "queued" | "downloading" | "paused" | "done" | "error";

export interface DlItem {
  id: string; title: string; subtitle: string; poster: string; meta: string;
  status: DlStatus; kind: "hls" | "file" | ""; ext: string; exportable: boolean;
  bytes: number; estTotal: number; progress: number; segsDone: number; segsTotal: number;
  speed: number; durationSec: number; error: string; errorCode: string;
  createdAt: number; finishedAt: number; waitingWifi: boolean; posterFile: string;
}
/** Guardado junto do download para poder pedir um link novo se o antigo expirar. */
export interface DlMeta { type: "movie" | "tv"; id: number; season?: number; episode?: number; server?: string }

export interface EnqueueInput {
  id: string; title: string; subtitle?: string; poster?: string; meta?: string;
  url: string; referer?: string; userAgent?: string; maxHeight?: number;
}
export interface DlStorage { downloadsBytes: number; freeBytes: number; totalBytes: number }

interface AlxDownloadsPlugin {
  list(): Promise<{ items: DlItem[]; wifiOnly: boolean }>;
  enqueue(o: EnqueueInput): Promise<{ item: DlItem }>;
  pause(o: { id: string }): Promise<void>;
  resume(o: { id: string }): Promise<void>;
  pauseAll(): Promise<void>;
  resumeAll(): Promise<void>;
  kick(): Promise<void>;
  remove(o: { id: string; deleteFiles?: boolean }): Promise<void>;
  updateUrl(o: { id: string; url: string; referer?: string }): Promise<void>;
  setOptions(o: { wifiOnly: boolean; maxActive?: number; threads?: number }): Promise<void>;
  storage(): Promise<DlStorage>;
  playUrl(o: { id: string }): Promise<{ url: string }>;
  exportFile(o: { id: string }): Promise<{ path: string }>;
  addListener(ev: "changed", cb: (e: { item: DlItem }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(ev: "removed", cb: (e: { id: string }) => void): Promise<{ remove: () => Promise<void> }>;
}
export const Downloads = registerPlugin<AlxDownloadsPlugin>("AlxDownloads");
export const downloadsAvailable = isNative;

// ---------------- preferências ----------------
const K_QUALITY = "alx.dl.quality", K_WIFI = "alx.dl.wifi";
export type Quality = 0 | 1080 | 720 | 480;
export const QUALITIES: { v: Quality; label: string }[] = [
  { v: 0, label: "Melhor" }, { v: 1080, label: "1080p" }, { v: 720, label: "720p" }, { v: 480, label: "480p" },
];
export function getQuality(): Quality {
  try { const n = Number(localStorage.getItem(K_QUALITY)); return (n === 1080 || n === 720 || n === 480 ? n : 0) as Quality; } catch { return 0; }
}
export function setQuality(q: Quality) { try { localStorage.setItem(K_QUALITY, String(q)); } catch { /* sem armazenamento */ } }
export type Speed = 4 | 8 | 16;
export const SPEEDS: { v: Speed; label: string }[] = [{ v: 4, label: "Econômico" }, { v: 8, label: "Rápido" }, { v: 16, label: "Máximo" }];
export function getSpeed(): Speed { try { const n = Number(localStorage.getItem("alx.dl.threads")); return (n === 4 || n === 8 ? n : 16) as Speed; } catch { return 16; } }
export function setSpeedPref(v: Speed) { try { localStorage.setItem("alx.dl.threads", String(v)); } catch { /* sem armazenamento */ } }
export function getWifiOnly(): boolean { try { return localStorage.getItem(K_WIFI) === "1"; } catch { return false; } }
export function setWifiOnlyPref(v: boolean) { try { localStorage.setItem(K_WIFI, v ? "1" : "0"); } catch { /* sem armazenamento */ } }

// posição de reprodução offline (para "continuar de onde parou")
const posKey = (id: string) => `alx.dl.pos.${id}`;
export const getOfflinePos = (id: string): number => { try { return Number(localStorage.getItem(posKey(id))) || 0; } catch { return 0; } };
export const setOfflinePos = (id: string, ms: number) => { try { if (ms > 0) localStorage.setItem(posKey(id), String(Math.round(ms))); else localStorage.removeItem(posKey(id)); } catch { /* ignora */ } };

/** Capa do download: o arquivo salvo no celular (funciona sem internet) ou, se não houver, o endereço da internet. */
export const posterSrc = (it: Pick<DlItem, "posterFile" | "poster">): string =>
  it.posterFile ? Capacitor.convertFileSrc(`file://${it.posterFile}`) : it.poster;

// ---------------- formatação ----------------
export function fmtBytes(n: number): string {
  if (!n || n < 0) return "0 MB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) { const mb = n / 1048576; return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1).replace(".", ",")} MB`; }
  return `${(n / 1073741824).toFixed(2).replace(".", ",")} GB`;
}
export const fmtSpeed = (bps: number) => (bps > 0 ? `${fmtBytes(bps)}/s` : "");
export function fmtEta(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "";
  if (sec < 60) return `${Math.ceil(sec)} s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)} min`;
  return `${Math.floor(sec / 3600)} h ${Math.ceil((sec % 3600) / 60)} min`;
}
export function fmtDuration(sec: number): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** Identificador estável: o mesmo filme/episódio nunca é baixado duas vezes. */
export const dlId = (type: string, id: number, season?: number, episode?: number) => `${type}-${id}${type === "tv" ? `-${season ?? 0}-${episode ?? 0}` : ""}`;
