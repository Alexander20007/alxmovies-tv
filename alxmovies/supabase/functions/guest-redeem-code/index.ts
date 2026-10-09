// ============================================================
// EDGE FUNCTION: guest-redeem-code
// ------------------------------------------------------------
// Recebe um código gerado por guest-generate-code e devolve uma
// sessão (access_token + refresh_token) válida para o MESMO perfil
// de convidado — usada quando a pessoa troca de aparelho, limpa os
// dados do navegador, ou simplesmente perdeu a sessão local, mas
// ainda está dentro das 24h da conta de convidado original.
//
// Chamada sem token de usuário (a pessoa pode não ter sessão
// nenhuma nesse momento) — só com a ANON_KEY pública no header
// Authorization, que é exigida pela própria plataforma do Supabase
// pra qualquer chamada de Edge Function.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CODE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — mesmo prazo da sessão de convidado

// CORS: obrigatório pra o navegador (rodando em outro domínio, ex: o
// site na Netlify) conseguir ler a resposta desta função.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  // Requisição "de teste" (preflight) que o navegador manda antes da
  // de verdade — sem responder isso, o fetch() real nunca é enviado.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  const rawCode = (body.code || "").trim().toUpperCase();
  if (!rawCode) return json({ error: "Informe o código." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: row, error: lookupError } = await admin
    .from("guest_recovery_codes")
    .select("user_id, email, created_at")
    .eq("code", rawCode)
    .maybeSingle();

  if (lookupError) return json({ error: "Erro ao consultar o código." }, 500);
  if (!row) return json({ error: "Código inválido." }, 404);

  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > CODE_MAX_AGE_MS) {
    // Vencido — apaga o código. A conta de convidado em si some depois
    // pela limpeza automática (cleanup-guest-accounts).
    await admin.from("guest_recovery_codes").delete().eq("user_id", row.user_id);
    return json({ error: "Esse código expirou (mais de 24h)." }, 410);
  }

  const { data: userLookup, error: userError } = await admin.auth.admin.getUserById(row.user_id);
  if (userError || !userLookup?.user) {
    return json({ error: "Essa conta de convidado não existe mais." }, 404);
  }

  // Gera um link mágico de login pro e-mail sintético desse convidado,
  // e troca o token pelo par access_token/refresh_token de verdade —
  // é o jeito suportado pelo Supabase de autenticar como um usuário
  // específico sem senha, a partir do servidor.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: row.email,
  });

  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return json({ error: "Não foi possível gerar o acesso: " + (linkError?.message || "") }, 500);
  }

  const plainClient = createClient(supabaseUrl, anonKey);
  const { data: sessionData, error: verifyError } = await plainClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (verifyError || !sessionData?.session) {
    return json({ error: "Não foi possível confirmar o acesso: " + (verifyError?.message || "") }, 500);
  }

  return json({
    session: sessionData.session,
    guestStartedAt: userLookup.user.created_at,
  });
});
