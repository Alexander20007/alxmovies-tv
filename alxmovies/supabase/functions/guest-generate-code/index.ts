// ============================================================
// EDGE FUNCTION: guest-generate-code
// ------------------------------------------------------------
// Gera um código curto (ex: "AB3CD-EF4GH") que representa a sessão
// de convidado ATUAL de quem está chamando. Guardando esse código,
// a pessoa consegue voltar pro mesmo perfil de convidado depois —
// mesmo trocando de aparelho ou limpando os dados do navegador —
// usando a função guest-redeem-code, contanto que ainda não tenham
// se passado 24h desde a criação da conta de convidado.
//
// Chamada pelo front-end com o token da PRÓPRIA sessão de convidado
// no header Authorization (é assim que a função sabe de quem é o
// código, sem precisar de mais nada).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I/L (evita confusão visual)

// CORS: obrigatório pra o navegador (rodando em outro domínio, ex: o
// site na Netlify) conseguir ler a resposta desta função.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function generateRawCode() {
  let raw = "";
  for (let i = 0; i < 10; i++) {
    raw += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  // O navegador manda essa requisição "de teste" (preflight) antes da
  // de verdade, sempre que há headers customizados (Authorization) numa
  // chamada entre domínios diferentes. Sem responder isso, o fetch()
  // real nunca nem chega a ser enviado.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Não autenticado." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente "como o usuário" — só serve pra confirmar quem está chamando,
  // a partir do próprio token de sessão dele.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: "Sessão inválida ou expirada." }, 401);
  }

  const user = userData.user;

  // Reconhece um convidado de duas formas: is_anonymous===true (nunca
  // gerou código antes) OU e-mail termina em "@alxmovies.guest" (já
  // gerou um código antes — isso confirma um e-mail técnico na conta,
  // o que faz o Supabase virar is_anonymous=false, mesmo continuando
  // sendo, na prática, uma conta de convidado). Sem essa segunda
  // checagem, gerar o código pela segunda vez sempre falhava.
  const looksLikeGuest =
    user.is_anonymous === true ||
    (typeof user.email === "string" && user.email.endsWith("@alxmovies.guest"));

  if (!looksLikeGuest) {
    return json({ error: "Esse recurso é só para contas de convidado." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const CODE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — mesmo prazo da sessão de convidado

  // "Ver/gerar código": se já existe um código válido (ainda dentro
  // das 24h) pra esse convidado, devolve ELE MESMO — sem trocar nada.
  // Antes, clicar de novo sempre criava um código novo e invalidava
  // o anterior sem avisar, o que quebrava qualquer código que a
  // pessoa já tivesse guardado. Só gera um novo se realmente não
  // existir nenhum ainda, ou se o que existia já venceu.
  const { data: existing } = await admin
    .from("guest_recovery_codes")
    .select("code, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs <= CODE_MAX_AGE_MS) {
      return json({ code: existing.code });
    }
  }

  // Tenta algumas vezes até achar um código que ainda não existe
  let code = "";
  let email = "";
  let attempts = 0;
  let updateError = null;

  while (attempts < 5) {
    code = generateRawCode();
    email = `guest.${code.replace("-", "").toLowerCase()}@alxmovies.guest`;

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });

    if (!error) {
      updateError = null;
      break;
    }
    updateError = error;
    attempts++;
  }

  if (updateError) {
    return json({ error: "Não foi possível gerar o código: " + updateError.message }, 500);
  }

  // Um convidado só tem um código ativo por vez — um código novo (só
  // criado quando não havia nenhum válido) substitui o anterior.
  const { error: upsertError } = await admin
    .from("guest_recovery_codes")
    .upsert(
      { user_id: user.id, code, email, created_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    return json({ error: "Não foi possível salvar o código: " + upsertError.message }, 500);
  }

  return json({ code });
});
