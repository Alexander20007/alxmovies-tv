import { CONFIG } from "./config";

/**
 * Camada do proxy (Cloudflare Worker). Todo pedido às rotas protegidas leva:
 *   Authorization: Bearer <JWT do Supabase>   +   X-Nonce: <código de uso único>
 * Com VITE_USE_PROXY desligado nada daqui interfere: os pedidos saem direto, como antes.
 */
const PROXY = CONFIG.PROXY_URL;
const NONCE_TTL_MS = 240_000; // o Worker guarda cada nonce por 300 s; descartamos antes para nunca usar um vencido
const POOL_SIZE = 6;
const LOW_WATER = 2;

// ---------- JWT (o cliente do Supabase registra aqui como ler a sessão; evita import circular) ----------
let getToken: () => Promise<string | null> = async () => null;
export const registerTokenGetter = (fn: () => Promise<string | null>) => { getToken = fn; };

// ---------- pool de nonces (reabastece em segundo plano) ----------
class NoncePool {
  private pool: { n: string; t: number }[] = [];
  private filling: Promise<void> | null = null;

  private async one() {
    const res = await fetch(`${PROXY}/nonce`);
    if (!res.ok) throw new Error("nonce " + res.status);
    const d = await res.json();
    return { n: String(d.nonce), t: Date.now() };
  }

  refill(): Promise<void> {
    if (!this.filling) {
      const now = Date.now();
      this.pool = this.pool.filter((x) => now - x.t < NONCE_TTL_MS);
      const need = Math.max(1, POOL_SIZE - this.pool.length);
      this.filling = Promise.allSettled(Array.from({ length: need }, () => this.one()))
        .then((rs) => { for (const r of rs) if (r.status === "fulfilled") this.pool.push(r.value); })
        .finally(() => { this.filling = null; });
    }
    return this.filling;
  }

  async take(): Promise<string> {
    for (let i = 0; i < 3; i++) {
      const now = Date.now();
      this.pool = this.pool.filter((x) => now - x.t < NONCE_TTL_MS);
      const item = this.pool.pop();
      if (item) {
        if (this.pool.length <= LOW_WATER) void this.refill(); // repõe sem fazer o pedido atual esperar
        return item.n;
      }
      await this.refill();
    }
    throw new Error("Não foi possível obter autorização do servidor. Verifique sua internet.");
  }
}
const nonces = new NoncePool();
/** Pré-carrega nonces (chamado quando a sessão existe) para o primeiro pedido não esperar. */
export const warmNonces = () => { if (CONFIG.USE_PROXY) void nonces.refill(); };

/** Para o diagnóstico: um nonce avulso, mostrando o motivo se falhar. */
export async function probeNonce(): Promise<Response> { return fetch(`${PROXY}/nonce`); }
export const currentToken = () => getToken();

async function send(url: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Nonce", await nonces.take());
  return fetch(url, { ...init, headers });
}

/**
 * fetch para as APIs do app (TMDB, streaming, canais, IA…). Se a URL é do proxy, acrescenta JWT + nonce
 * e tenta mais uma vez com outro nonce em caso de 401. Fora do proxy (chave desligada) é um fetch normal.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!CONFIG.USE_PROXY || !url.startsWith(PROXY)) return fetch(url, init);
  let res = await send(url, init, await getToken());
  if (res.status === 401) res = await send(url, init, await getToken());
  return res;
}

// ---------- fetch do supabase-js ----------
const SB_AUTH_PREFIX = `${PROXY}/sb/auth/v1/`;

/**
 * Entregue ao createClient (global.fetch):
 *  • login/cadastro/renovação (/auth/v1/*) → rota pública /sb-auth/* (ainda não existe JWT) — sem nonce;
 *  • todo o resto (tabelas, funções, storage) → /sb/* com nonce. O Authorization já vem do supabase-js.
 */
export async function sbFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (raw.startsWith(SB_AUTH_PREFIX)) return fetch(`${PROXY}/sb-auth/${raw.slice(SB_AUTH_PREFIX.length)}`, init);
  if (!raw.startsWith(PROXY)) return fetch(input as RequestInfo, init);
  let res = await send(raw, init, null);
  if (res.status === 401) res = await send(raw, init, null);
  return res;
}

// ---------- tempo real (websocket) ----------
// O navegador não manda headers num websocket: o JWT vai na URL (/ws/realtime?token=...). Guardamos o último token aqui.
let lastToken: string | null = null;
export const setLastToken = (t: string | null) => { lastToken = t; };

/** Entregue ao supabase-js (realtime.transport): troca o endereço do websocket pelo do proxy. */
export class ProxyRealtimeSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const u = new URL(String(url));
    const q = new URLSearchParams(u.search);
    const params = new URLSearchParams({ token: lastToken ?? "" });
    q.forEach((v, k) => params.set(k, v));
    super(`${PROXY.replace(/^http/i, "ws")}/ws/realtime?${params.toString()}`, protocols);
  }
}

/** Links públicos de arquivos (avatares): rota pública /sb-storage/object/public/* do proxy (são <img src>, sem headers). */
export const toPublicFileUrl = (u: string) => u.replace(`${PROXY}/sb/storage/v1/`, `${PROXY}/sb-storage/`);
