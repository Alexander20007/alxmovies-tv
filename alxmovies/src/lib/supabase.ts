import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";

/** O supabase-js limpa o hash da URL ao processar o link; guardamos antes para a tela de nova senha. */
export const openedViaRecoveryLink = typeof window !== "undefined" && window.location.hash.includes("type=recovery");

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
