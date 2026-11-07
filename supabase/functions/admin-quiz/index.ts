// Edge Function "admin-quiz": teste para virar admin (perguntas do Gemini, conferidas por uma 2ª chamada; correção no servidor).
// Secrets: GEMINI_API_KEY (aistudio.google.com) e, opcional, QUIZ_MODEL. Sem chave, usa o banco de reserva abaixo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODELS = [...new Set([Deno.env.get("QUIZ_MODEL"), "gemini-flash-latest", "gemini-2.5-flash"].filter((m): m is string => !!m))];
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const TOTAL = 12;          // perguntas por teste
const PASS = 10;           // acertos para passar (≈83%)
const MINUTES = 20;        // tempo para responder
const MAX_PER_DAY = 3;     // tentativas em 24 h
const COOLDOWN_MIN = 30;   // espera depois de reprovar

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Q { q: string; options: string[]; answer: number }

// banco de perguntas (reserva)
const BANK: Q[] = [
  { q: "Dois usuários se acusam de ofensas e você só recebeu o print de um deles. Qual é a conduta mais justa?", options: ["Punir quem enviou o print, já que trouxe provas", "Pedir o contexto e as provas dos dois lados e olhar o histórico antes de decidir", "Punir os dois igualmente para evitar favorecimento", "Esperar que resolvam sozinhos e só agir se piorar"], answer: 1 },
  { q: "Um amigo seu, também admin, publicou o mesmo link de divulgação várias vezes. O que você faz?", options: ["Conversa em particular e deixa passar desta vez", "Remove as publicações sem avisar ninguém para evitar constrangimento", "Segue o mesmo processo de qualquer pessoa e avisa o dono", "Tira as permissões dele por conta própria"], answer: 2 },
  { q: "Uma criança diz ter 12 anos e pede para liberar conteúdo adulto no perfil dela. A resposta mais adequada é:", options: ["Liberar se ela garantir que os pais permitem", "Pedir um documento para confirmar a idade", "Liberar por uma semana como teste", "Explicar que o perfil infantil segue a classificação indicativa e que mudanças dependem do responsável pela conta"], answer: 3 },
  { q: "Uma mensagem da 'equipe de suporte' pede que usuários instalem um APK de um link externo para 'corrigir o app'. O mais correto é:", options: ["Instalar no seu celular primeiro para testar", "Orientar a instalar só pelo link oficial do site e avisar o dono sobre a mensagem", "Responder que é seguro se alguém conhecido enviou", "Ignorar, pois cada um decide o que instala"], answer: 1 },
  { q: "Um desconhecido envia a você uma planilha com e-mails de usuários 'para ajudar a equipe'. A melhor atitude é:", options: ["Abrir e conferir quais e-mails estão corretos", "Encaminhar aos outros admins para conferirem juntos", "Não abrir nem repassar, e avisar o dono para avaliar um possível vazamento", "Guardar a planilha caso seja útil depois"], answer: 2 },
  { q: "Um usuário punido pergunta quem o denunciou. Como responder?", options: ["Revelar, por transparência", "Dizer só o primeiro nome do denunciante", "Revelar se ele prometer que não vai retaliar", "Manter o sigilo de quem denuncia e explicar o motivo da medida"], answer: 3 },
  { q: "Um usuário diz que sua conta foi invadida. Qual primeira orientação é mais útil e segura?", options: ["Criar outra conta e esquecer a antiga", "Enviar a senha antiga a um admin para investigar", "Trocar a senha por uma longa e única, revisar onde mais usava a mesma senha e avisar o suporte", "Esperar alguns dias para ver se o problema some"], answer: 2 },
  { q: "Um usuário pede uma cópia dos dados que o app guarda sobre ele. O que fazer?", options: ["Recusar, pois os dados pertencem ao app", "Enviar a qualquer pessoa que informe o e-mail da conta", "Confirmar que é o dono da conta e encaminhar ao dono do app para atender o pedido", "Cobrar uma taxa pelo trabalho"], answer: 2 },
  { q: "Cinco denúncias contra a mesma pessoa chegam de contas criadas no mesmo dia. Qual é o raciocínio mais prudente?", options: ["Punir de imediato, pois são várias denúncias", "Considerar a chance de um ataque combinado e analisar as provas antes de decidir", "Ignorar denúncias de contas novas para sempre", "Divulgar o nome dos denunciantes"], answer: 1 },
  { q: "Você recebe um link para o 'painel de admin' e uma mensagem pedindo para fazer login ali. Qual cuidado é essencial?", options: ["Entrar se a página parecer igual à oficial", "Conferir o endereço e abrir o site oficial digitando você mesmo o endereço", "Entrar e trocar a senha logo depois", "Enviar a senha a alguém para checar se é segura"], answer: 1 },
  { q: "Você apagou um conteúdo por engano. O que fazer?", options: ["Esconder o erro para evitar problemas", "Restaurar se possível, avisar o afetado e o dono, e ajustar o processo para não repetir", "Dizer que foi uma falha do app", "Apagar o histórico de ações"], answer: 1 },
  { q: "Chega um SMS dizendo ser do 'suporte' e pedindo o código de verificação que acabou de chegar. Qual é a atitude correta?", options: ["Enviar, pois só o suporte conhece esse código", "Nunca compartilhar códigos de verificação com ninguém, mesmo que pareça uma equipe oficial", "Enviar só metade do código", "Enviar e trocar a senha depois"], answer: 1 },
];

// utilidades
const shuffle = <T,>(a: T[]): T[] => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Embaralha as alternativas (a resposta certa muda de posição) e devolve a nova posição dela. */
function shuffleOptions(q: Q): Q {
  const idx = shuffle([0, 1, 2, 3]);
  return { q: q.q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) };
}

function valid(x: any): x is Q {
  return x && typeof x.q === "string" && x.q.length >= 10 && x.q.length <= 400
    && Array.isArray(x.options) && x.options.length === 4 && x.options.every((o: unknown) => typeof o === "string" && o.length > 0 && o.length <= 200)
    && new Set(x.options.map((o: string) => o.trim().toLowerCase())).size === 4
    && Number.isInteger(x.answer) && x.answer >= 0 && x.answer <= 3;
}

/** Chama o Gemini pedindo JSON. Tenta cada modelo da lista até um responder. */
async function gemini(prompt: string, temperature: number): Promise<string> {
  if (!AI_KEY) return "";
  for (const model of MODELS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 35000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: ctrl.signal,
        headers: { "x-goog-api-key": AI_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
      });
      if (!res.ok) { console.error("gemini", model, res.status, (await res.text()).slice(0, 200)); continue; }
      const data = await res.json();
      const text = ((data?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map((p) => p?.text ?? "").join("");
      if (text) return text;
    } catch (e) { console.error("gemini erro", model, String(e)); } finally { clearTimeout(t); }
  }
  return "";
}

function parseArray(text: string): unknown[] {
  try { const v = JSON.parse(text); if (Array.isArray(v)) return v; } catch { /* tenta recortar */ }
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s < 0 || e < s) return [];
  try { const v = JSON.parse(text.slice(s, e + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Pede ao Gemini perguntas difíceis; depois o próprio Gemini as responde SEM ver o gabarito e descartamos as que não batem (ambíguas ou erradas). */
async function aiQuestions(): Promise<Q[]> {
  if (!AI_KEY) return [];
  const want = TOTAL + 6; // gera a mais porque algumas serão descartadas na conferência
  const seed = Math.random().toString(36).slice(2, 8);
  const raw = await gemini(
`Crie ${want} perguntas de múltipla escolha, em português do Brasil, para selecionar voluntários de moderação e suporte de um app de filmes e séries (ALXmovies).
NÍVEL MÉDIO A DIFÍCIL: situações práticas ou dilemas em que 2 ou 3 alternativas parecem razoáveis e só uma é a MELHOR conduta (proporcionalidade, imparcialidade, privacidade, segurança de menores, sigilo, prudência, comunicação).
Temas (misture): denúncias com provas incompletas, conflito de interesses, ataques combinados, LGPD, perfis infantis, golpes e phishing, vazamentos, sigilo, punição proporcional, corrigir erros, avisos claros, pressão de usuários, uso responsável de poderes de admin, segurança de contas.
REGRAS: 4 alternativas plausíveis, de tamanho parecido; a correta NÃO pode ser a mais longa nem a única cuidadosa. Sem "todas/nenhuma das anteriores". Só uma defensável. Não repita temas. Distribua a correta entre 0,1,2,3. Variação: ${seed}.
Responda SOMENTE com JSON, neste formato: [{"q":"pergunta","options":["A","B","C","D"],"answer":0}]  (answer = índice 0 a 3 da alternativa correta)`, 1);
  const cand = (parseArray(raw).filter(valid) as Q[]).slice(0, want);
  if (cand.length < 4) return [];

  // conferência independente: o modelo responde sem ver o gabarito
  const shuffled = cand.map(shuffleOptions);
  const check = await gemini(
`Responda cada pergunta abaixo escolhendo a MELHOR alternativa (índice de 0 a 3). Seja criterioso.
Responda SOMENTE com um array JSON de números, um por pergunta, na mesma ordem. Exemplo: [2,0,1]
${JSON.stringify(shuffled.map((x) => ({ q: x.q, options: x.options })))}`, 0);
  const picks = parseArray(check);
  if (picks.length !== shuffled.length) return [];
  return shuffled.filter((x, i) => picks[i] === x.answer);
}

async function makeQuestions(): Promise<{ list: Q[]; source: string }> {
  const ai = (await aiQuestions()).slice(0, TOTAL);
  const list = ai.slice();
  if (list.length < TOTAL) {
    const used = new Set(list.map((x) => x.q));
    for (const b of shuffle(BANK).map(shuffleOptions)) { if (list.length >= TOTAL) break; if (!used.has(b.q)) list.push(b); }
  }
  return { list: shuffle(list), source: ai.length >= TOTAL ? "ia" : ai.length ? "mista" : "banco" };
}

const publicQuestions = (qs: Q[]) => qs.map((x) => ({ q: x.q, options: x.options }));

// ações
async function isStaff(uid: string) {
  const { data } = await db.from("app_staff").select("user_id").eq("user_id", uid).maybeSingle();
  return !!data;
}

async function status(uid: string) {
  if (await isStaff(uid)) return { state: "already" };
  const { data: owner } = await db.from("app_admins").select("user_id").eq("user_id", uid).maybeSingle();
  if (owner) return { state: "already" };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await db.from("quiz_attempts").select("created_at, finished_at, passed").eq("user_id", uid).gte("created_at", since).order("created_at", { ascending: false });
  const rows = data ?? [];
  const last = rows[0];
  if (rows.length >= MAX_PER_DAY && !(last && !last.finished_at)) {
    const oldest = new Date(rows[rows.length - 1].created_at).getTime();
    return { state: "limit", retryAt: new Date(oldest + 24 * 3600 * 1000).toISOString() };
  }
  if (last?.finished_at && last.passed === false) {
    const at = new Date(last.finished_at).getTime() + COOLDOWN_MIN * 60000;
    if (at > Date.now()) return { state: "cooldown", retryAt: new Date(at).toISOString() };
  }
  return { state: "ready", total: TOTAL, pass: PASS, minutes: MINUTES, maxPerDay: MAX_PER_DAY, left: MAX_PER_DAY - rows.length };
}

async function start(uid: string) {
  if (await isStaff(uid)) return { state: "already" };
  // tentativa aberta e ainda válida: continua a mesma (sem sortear perguntas novas)
  const { data: open } = await db.from("quiz_attempts").select("*").eq("user_id", uid).is("finished_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open) return { state: "running", attemptId: open.id, expiresAt: open.expires_at, questions: publicQuestions(open.questions as Q[]) };
  const st = await status(uid) as any;
  if (st.state !== "ready") return st;
  // se havia uma tentativa vencida sem envio, ela já conta e é encerrada
  await db.from("quiz_attempts").update({ finished_at: new Date().toISOString(), score: 0, passed: false }).eq("user_id", uid).is("finished_at", null).lte("expires_at", new Date().toISOString());
  const { list, source } = await makeQuestions();
  const expires = new Date(Date.now() + MINUTES * 60000).toISOString();
  const { data, error } = await db.from("quiz_attempts").insert({ user_id: uid, questions: list, expires_at: expires }).select("id").single();
  if (error) throw error;
  console.log("quiz iniciado", uid, source);
  return { state: "running", attemptId: data.id, expiresAt: expires, questions: publicQuestions(list) };
}

async function submit(uid: string, body: any) {
  const { data: at } = await db.from("quiz_attempts").select("*").eq("id", String(body.attemptId ?? "")).eq("user_id", uid).maybeSingle();
  if (!at || at.finished_at) return { state: "invalid" };
  const qs = at.questions as Q[];
  const answers: unknown[] = Array.isArray(body.answers) ? body.answers : [];
  const expired = new Date(at.expires_at).getTime() + 15000 < Date.now();   // 15 s de folga para a internet
  const score = expired ? 0 : qs.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  const passed = !expired && score >= PASS;
  const { data: upd } = await db.from("quiz_attempts").update({ finished_at: new Date().toISOString(), score, passed }).eq("id", at.id).is("finished_at", null).select("id");
  if (!upd?.length) return { state: "invalid" };
  if (expired) return { state: "expired" };
  if (passed) await db.from("app_staff").upsert({ user_id: uid, granted_via: "quiz" }, { onConflict: "user_id", ignoreDuplicates: true });
  return { state: "done", score, total: qs.length, passed, pass: PASS };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return json({ state: "login" });
    const uid = data.user.id;
    const body = await req.json().catch(() => ({}));
    if (body.action === "status") return json(await status(uid));
    if (body.action === "start") return json(await start(uid));
    if (body.action === "submit") return json(await submit(uid, body));
    return json({ state: "invalid" }, 400);
  } catch (e) {
    console.error(e);
    return json({ state: "error" }, 500);
  }
});
