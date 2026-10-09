// ============================================================
// EDGE FUNCTION: cleanup-guest-accounts
// ------------------------------------------------------------
// Apaga do Supabase Auth as contas de convidado (login anônimo,
// "Entrar como convidado") que já passaram das 24h — o MESMO prazo
// que o front-end (js/guard.js) usa pra encerrar a sessão na tela.
//
// Essa função NÃO é chamada pelo site. Ela roda sozinha, agendada
// (veja sql/cleanup-guest-accounts-cron.sql), porque só o servidor
// pode enxergar TODOS os usuários e apagá-los — o front-end só
// consegue reconhecer a expiração de QUEM ESTÁ COM A ABA ABERTA.
//
// Protegida por um segredo (CRON_CLEANUP_SECRET) que só quem agenda
// a chamada conhece — sem ele, ninguém consegue disparar limpezas em
// massa só sabendo a URL da função.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GUEST_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

// Reconhece uma conta de convidado de duas formas:
//  1) is_anonymous === true → convidado que nunca gerou código
//  2) e-mail termina em "@alxmovies.guest" → convidado que gerou um
//     código de recuperação em algum momento (isso confirma um e-mail
//     técnico na conta, o que faz o Supabase virar is_anonymous=false
//     — sem essa segunda checagem, essas contas nunca seriam limpas)
function looksLikeGuestAccount(user) {
  if (user.is_anonymous === true) return true;
  if (typeof user.email === "string" && user.email.endsWith("@alxmovies.guest")) return true;
  return false;
}

Deno.serve(async (req) => {
  // --- Autorização por segredo compartilhado ---
  const cronSecret = Deno.env.get("CRON_CLEANUP_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontos no ambiente
  // de toda Edge Function do Supabase — não precisa configurar.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const cutoff = Date.now() - GUEST_MAX_AGE_MS;
  const deletedIds: string[] = [];
  const failedIds: string[] = [];
  let checked = 0;
  let page = 1;
  const perPage = 200;

  try {
    // Percorre todos os usuários em páginas até acabar
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const users = data.users ?? [];
      if (users.length === 0) break;

      for (const user of users) {
        checked++;
        const isGuest = looksLikeGuestAccount(user);
        const createdAtMs = new Date(user.created_at).getTime();

        if (isGuest && createdAtMs < cutoff) {
          const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
          if (deleteError) {
            failedIds.push(user.id);
            console.error(`Falha ao apagar convidado ${user.id}:`, deleteError.message);
          } else {
            deletedIds.push(user.id);
          }
        }
      }

      if (users.length < perPage) break; // chegou na última página
      page++;
    }

    return new Response(
      JSON.stringify({
        checked,
        deleted: deletedIds.length,
        failed: failedIds.length,
        deletedIds,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
