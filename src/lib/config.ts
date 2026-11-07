const env = import.meta.env;

// ── Proxy (Cloudflare Worker) ─────────────────────────────────────────────────────────────────────────
// Padrão: DESLIGADO — o app fala direto com os serviços, como sempre. Com VITE_USE_PROXY=true (build) tudo passa pelo proxy
// (JWT + nonce). A única parte que usa o proxy mesmo desligado é a verificação de versão nova (/release, pública).
const USE_PROXY: boolean = __USE_PROXY__;
const PROXY_URL = String(env.VITE_PROXY_URL ?? "https://alx-proxy.alexander221alex.workers.dev").replace(/\/+$/, "");

// Endereços diretos (com USE_PROXY = true este objeto vira {} e os textos somem do pacote).
const D: Record<string, string> = USE_PROXY ? {} : {
  SUPABASE: env.VITE_SUPABASE_URL ?? "https://onqxflwfkexitipylixc.supabase.co",
  STREAM: env.VITE_STREAM_BASE_URL ?? "https://alx-api.onrender.com",
  EXTRACTOR: env.VITE_EXTRACTOR_BASE_URL ?? "https://api-alex-jney.onrender.com",
  CHANNELS: env.VITE_CHANNELS_API_URL ?? "https://alx-player.netlify.app/.netlify/functions/canais",
  EPG: env.VITE_EPG_API_URL ?? "https://alx-player.netlify.app/.netlify/functions/programacao",
};
const pick = (viaProxy: string, direct: string | undefined) => (USE_PROXY ? viaProxy : (direct as string));

export const CONFIG = {
  USE_PROXY,
  PROXY_URL,
  SUPABASE_URL: pick(`${PROXY_URL}/sb`, D.SUPABASE),
  SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_P6xFktXhhIjgC4hVxD6FxA_EbPl-clT",
  /** Base das funções do Supabase chamadas "na mão" (convidado). */
  FUNCTIONS_URL: pick(`${PROXY_URL}/sb-fn`, D.SUPABASE ? `${D.SUPABASE}/functions/v1` : undefined),
  TMDB_FUNCTION_URL: pick(`${PROXY_URL}/sb-fn/bright-handler`, D.SUPABASE ? `${D.SUPABASE}/functions/v1/bright-handler` : undefined),
  GEMINI_FUNCTION_URL: pick(`${PROXY_URL}/sb-fn/smooth-endpoint`, D.SUPABASE ? `${D.SUPABASE}/functions/v1/smooth-endpoint` : undefined),
  TMDB_IMG_BASE: "https://image.tmdb.org/t/p",
  POSTER_SIZE: "w500",
  BACKDROP_SIZE: "w1280",
  /** APIs (pedidos com JWT + nonce) */
  STREAM_BASE_URL: pick(`${PROXY_URL}/alx`, D.STREAM),
  EXTRACTOR_BASE_URL: pick(`${PROXY_URL}/jney`, D.EXTRACTOR),
  /** Links de vídeo (player/1DM não mandam JWT/nonce): rotas de mídia do proxy, só /api/proxy e /proxy. */
  STREAM_MEDIA_URL: pick(`${PROXY_URL}/alxm`, D.STREAM),
  EXTRACTOR_MEDIA_URL: pick(`${PROXY_URL}/jneym`, D.EXTRACTOR),
  CHANNELS_API_URL: pick(`${PROXY_URL}/canais`, D.CHANNELS),
  EPG_API_URL: pick(`${PROXY_URL}/epg`, D.EPG),
  /** Versão nova: tenta o proxy (público, sem login) e, se falhar, o GitHub direto. */
  RELEASE_API_URL: `${PROXY_URL}/release`,
  RELEASE_DIRECT_URL: "https://api.github.com/repos/Alexander20007/alxmovies-tv/releases/latest",
  GEMINI_MODEL: env.VITE_GEMINI_MODEL ?? "gemini-3.5-flash",
  GUEST_SESSION_MS: 24 * 60 * 60 * 1000,
  /**
   * ANÚNCIOS (app Android) — tudo direto aqui, sem variável nem secret do GitHub.
   * Duas redes: Start.io e Unity Ads. A regra decide qual aparece:
   *   STRATEGY "fallback"  → usa a PRIMARY; se ela não tiver anúncio pronto, usa a outra.
   *   STRATEGY "alternate" → reveza as duas (metade para cada); se a da vez não tiver anúncio, usa a outra.
   * TEST_MODE true = anúncios de teste (use só para testar; em anúncio real não clique nos seus próprios anúncios).
   */
  ADS: {
    TEST_MODE: false,
    PRIMARY: "startio" as "startio" | "unity",
    STRATEGY: "fallback" as "fallback" | "alternate",
    START_IO: { APP_ID: "209397119" },
    UNITY: {
      GAME_ID: "800415313",
      INTERSTITIAL: "BP_Interstitial_Android",
      REWARDED: "BP_Rewarded_Android",
      BANNER: "BP_Banner_Android",
    },
  },
} as const;
