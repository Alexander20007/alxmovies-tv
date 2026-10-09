const env = import.meta.env;

export const CONFIG = {
  SUPABASE_URL: env.VITE_SUPABASE_URL ?? "https://onqxflwfkexitipylixc.supabase.co",
  SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_P6xFktXhhIjgC4hVxD6FxA_EbPl-clT",
  TMDB_FUNCTION_URL:
    env.VITE_TMDB_FUNCTION_URL ??
    "https://onqxflwfkexitipylixc.supabase.co/functions/v1/bright-handler",
  TMDB_IMG_BASE: "https://image.tmdb.org/t/p",
  POSTER_SIZE: "w500",
  BACKDROP_SIZE: "w1280",
  STREAM_BASE_URL: env.VITE_STREAM_BASE_URL ?? "https://alx-api.onrender.com",
  EXTRACTOR_BASE_URL: env.VITE_EXTRACTOR_BASE_URL ?? "https://api-alex-jney.onrender.com",
  CHANNELS_API_URL: env.VITE_CHANNELS_API_URL ?? "https://alx-player.netlify.app/.netlify/functions/canais",
  EPG_API_URL: env.VITE_EPG_API_URL ?? "https://alx-player.netlify.app/.netlify/functions/programacao",
  GEMINI_FUNCTION_URL: env.VITE_GEMINI_FUNCTION_URL ?? "https://onqxflwfkexitipylixc.supabase.co/functions/v1/smooth-endpoint",
  GEMINI_MODEL: env.VITE_GEMINI_MODEL ?? "gemini-3.5-flash",
  GUEST_SESSION_MS: 24 * 60 * 60 * 1000,
} as const;
