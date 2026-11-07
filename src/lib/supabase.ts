import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";
import { ProxyRealtimeSocket, registerTokenGetter, sbFetch, setLastToken, warmNonces } from "./proxy";

/** O supabase-js limpa o hash da URL ao processar o link; guardamos antes para a tela de nova senha. */
export const openedViaRecoveryLink = typeof window !== "undefined" && window.location.hash.includes("type=recovery");

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  CONFIG.USE_PROXY ? { global: { fetch: sbFetch }, realtime: { transport: ProxyRealtimeSocket as any } } : undefined,
);

if (CONFIG.USE_PROXY) {
  registerTokenGetter(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
  supabase.auth.onAuthStateChange((_e, session) => { setLastToken(session?.access_token ?? null); if (session) warmNonces(); });
  void supabase.auth.getSession().then(({ data }) => setLastToken(data.session?.access_token ?? null));
}
