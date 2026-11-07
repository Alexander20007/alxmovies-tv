import { registerPlugin } from "@capacitor/core";

export interface NativePlayOptions {
  url: string;
  title: string;
  subtitle?: string;
  poster?: string;
  startMs?: number;
  startPercent?: number;
  hasNext: boolean;
  server: string;
  source: "main" | "fallback";
  fallbackLabel: string;
  servers: { label: string; ok: boolean }[];
  rate: number;
  /** Canal ao vivo: sem barra de tempo, com "canal anterior/próximo". */
  live?: boolean;
  hasPrev?: boolean;
  referer?: string;
  logo?: string;
}
export type NativeReason = "closed" | "ended" | "next" | "prev" | "server" | "error";
export interface NativePlayResult { reason: NativeReason; positionMs: number; durationMs: number; rate: number; server?: string; played?: boolean }
export interface ProbeResult { online: boolean; reason: string; ms: number }

interface AlxPlayerPlugin {
  play(o: NativePlayOptions): Promise<NativePlayResult>;
  /** Verifica um canal de verdade: baixa a playlist e um trecho de vídeo (com User-Agent e Referer). */
  probe(o: { url: string; referer?: string }): Promise<ProbeResult>;
  /** Troca o nome do programa no player ao vivo aberto. */
  setSubtitle(o: { text: string }): Promise<void>;
  /** Texto do último fechamento inesperado do app (vazio se nunca houve). */
  /** Abre o reconhecimento de voz do Android e devolve o que foi falado ("" se cancelou). */
  listen(o?: { prompt?: string }): Promise<{ text: string }>;
  getLastCrash(): Promise<{ trace: string; at: number }>;
  clearLastCrash(): Promise<void>;
  addListener(ev: "progress", cb: (p: { positionMs: number; durationMs: number }) => void): Promise<{ remove: () => Promise<void> }>;
}
export const NativePlayer = registerPlugin<AlxPlayerPlugin>("AlxPlayer");
