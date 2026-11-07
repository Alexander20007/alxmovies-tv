// Edge Function "push-send": recebe do banco (gatilho push_notify) uma mensagem nova ou um aviso de amizade
// e manda o push (FCM) para os aparelhos do perfil que deve receber. Só envia dados (o app monta a notificação,
// com os botões de responder). Deploy SEM verificação de JWT: a proteção é o segredo no cabeçalho x-push-secret.
//
// Secrets necessários (supabase secrets set ...):
//   PUSH_SECRET           — a mesma senha que está no sql/push-notifications.sql
//   FCM_SERVICE_ACCOUNT   — o JSON inteiro da conta de serviço do Firebase (uma linha)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// ---------- token OAuth do Google (conta de serviço → FCM v1) ----------
let cached: { token: string; exp: number } | null = null;

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function accessToken(sa: { client_email: string; private_key: string }) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Falha ao obter token do Google: " + JSON.stringify(json));
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

// ---------- envio ----------
async function sendToProfile(profileId: string, data: Record<string, string>) {
  const { data: rows } = await db.from("push_tokens").select("token").eq("profile_id", profileId);
  if (!rows?.length) return;

  const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "{}");
  if (!sa.project_id) throw new Error("FCM_SERVICE_ACCOUNT não configurado");
  const bearer = await accessToken(sa);

  await Promise.all(rows.map(async ({ token }) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token, data, android: { priority: "HIGH", ttl: "86400s" } } }),
    });
    if (res.status === 404 || res.status === 400) {
      const err = await res.json().catch(() => null);
      const code = JSON.stringify(err ?? "");
      if (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(code)) await db.from("push_tokens").delete().eq("token", token);
    }
  }));
}

/** Manda para todos os aparelhos inscritos no tópico (ex.: "app-updates"). */
async function sendToTopic(topic: string, data: Record<string, string>, notification?: { title: string; body: string }) {
  const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "{}");
  if (!sa.project_id) throw new Error("FCM_SERVICE_ACCOUNT não configurado");
  const bearer = await accessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    // Com "notification" o próprio Android mostra o aviso na barra, mesmo com o app fechado e em QUALQUER versão do app.
    body: JSON.stringify({
      message: {
        topic, data,
        ...(notification ? { notification } : {}),
        android: { priority: "HIGH", ttl: "172800s", ...(notification ? { notification: { channel_id: "alx_avisos" } } : {}) },
      },
    }),
  });
  if (!res.ok) throw new Error("FCM recusou o envio ao tópico: " + (await res.text()));
}

const preview = (kind: string, body: string) =>
  kind === "title" ? "🎬 Indicou um título" : kind === "room" ? "👥 Convidou pra uma sala" : body;

async function profileName(id: string) {
  const { data } = await db.from("profiles").select("name").eq("id", id).maybeSingle();
  return data?.name ?? "";
}

Deno.serve(async (req) => {
  if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_SECRET")) return new Response("forbidden", { status: 403 });
  try {
    const { table, record: r } = await req.json();

    if (table === "friend_messages") {
      const { data: f } = await db.from("friendships").select("requester_id, addressee_id, status").eq("id", r.friendship_id).maybeSingle();
      if (!f || f.status !== "accepted") return new Response("skip");
      const to = f.requester_id === r.sender_id ? f.addressee_id : f.requester_id;
      const { data: s } = await db.from("profile_social").select("friends_enabled").eq("profile_id", to).maybeSingle();
      if (s && s.friends_enabled === false) return new Response("skip");
      await sendToProfile(to, {
        type: "message", mid: String(r.id), fid: String(r.friendship_id), pid: String(to),
        name: await profileName(r.sender_id), text: preview(r.kind, r.body ?? ""), ts: String(new Date(r.created_at).getTime() || Date.now()),
      });
    } else if (table === "app_update") {
      // chamado pelo GitHub Actions depois de publicar a versão nova: { "table": "app_update", "record": { "version": "1.0.12" } }
      const version = String(r?.version ?? "").replace(/^v/, "");
      if (!/^\d+(\.\d+)*$/.test(version)) return new Response("versão inválida", { status: 400 });
      await sendToTopic("app-updates", { type: "app_update", version });
    } else if (table === "announcements") {
      // aviso do admin: chega a todos os aparelhos inscritos (inclusive versões antigas do app)
      await sendToTopic("app-updates",
        { type: "announcement", id: String(r.id), title: String(r.title ?? ""), body: String(r.body ?? ""), url: String(r.url ?? ""), author: String(r.author_label ?? "") },
        r.author_label
          ? { title: `${r.author_label} ✔`, body: `${r.title}: ${r.body}`.slice(0, 240) }
          : { title: String(r.title ?? "ALXmovies").slice(0, 80), body: String(r.body ?? "").slice(0, 240) });
    } else if (table === "social_notifications") {
      await sendToProfile(r.profile_id, {
        type: r.kind, nid: String(r.id), fid: String(r.friendship_id ?? ""), pid: String(r.profile_id),
        name: r.from_profile_id ? await profileName(r.from_profile_id) : "",
      });
    }
    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("erro", { status: 500 });
  }
});
