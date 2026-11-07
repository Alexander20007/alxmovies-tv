import { CONFIG } from "@/lib/config";
import { apiFetch } from "@/lib/proxy";
import type { Channel } from "./channels";

export async function askGemini(prompt: string, model: string = CONFIG.GEMINI_MODEL): Promise<string> {
  if (!prompt.trim()) throw new Error("Digite uma pergunta para a IA.");
  let res: Response;
  try {
    res = await apiFetch(CONFIG.GEMINI_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ prompt, model }),
    });
  } catch { throw new Error("Não foi possível falar com a IA agora. Verifique sua conexão e tente novamente."); }

  let data: any;
  try { data = await res.json(); } catch { throw new Error("Resposta inválida da IA."); }

  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error
        : data?.error?.message ? data.error.message
        : res.status === 403 ? "Acesso negado: este assistente só funciona no site oficial do ALXmovies."
        : res.status === 401 ? "Não autorizado a usar a IA."
        : `Erro ao consultar a IA (status ${res.status}).`
    );
  }
  const candidate = data?.candidates?.[0];
  if (!candidate && data?.promptFeedback?.blockReason) throw new Error("A IA não pôde responder a essa pergunta.");
  const text = candidate?.content?.parts?.map((p: any) => p.text || "").join("").trim() || "";
  if (!text) throw new Error("A IA não retornou nenhuma resposta. Tente reformular a pergunta.");
  return text;
}

export interface AssistantRoom { title: string; movieTitle: string; hostName: string; hasPassword: boolean }
type TitleRef = { title: string; year?: string; mediaType?: "movie" | "tv" };
/** Ações que a Laura pode executar no app a pedido da pessoa. */
export type LauraAction =
  | ({ type: "play"; season?: number | null; episode?: number | null } & TitleRef)
  | { type: "continue" }
  | ({ type: "open_details" } & TitleRef)
  | ({ type: "trailer" } & TitleRef)
  | ({ type: "download" } & TitleRef)
  | ({ type: "add_to_list" } & TitleRef)
  | ({ type: "remove_from_list" } & TitleRef)
  | ({ type: "mark_watched" } & TitleRef)
  | ({ type: "share" } & TitleRef)
  | ({ type: "rate"; rating: "loved" | "liked" | "disliked" } & TitleRef)
  | ({ type: "create_room" } & TitleRef)
  | { type: "person"; name: string }
  | { type: "play_channel"; name: string }
  | { type: "channel_now"; name: string }
  | { type: "join_room"; name: string }
  | { type: "goto"; screen: "home" | "list" | "search" | "channels" | "rooms" | "friends" | "messages" | "notifications" | "account"; query?: string };

export interface AssistantAnswer {
  reply: string;
  titles: { title: string; year: string; type: "movie" | "tv" }[];
  channels: string[];
  rooms: string[];
  actions: LauraAction[];
  suggestions: string[];
}

export async function askMovieAssistant(
  question: string,
  { onlineChannels = [], watchHistory = [], onlineRooms = [], history = [], lastTitles = [] }: {
    onlineChannels?: Channel[]; watchHistory?: { title: string; type: string }[]; onlineRooms?: AssistantRoom[];
    /** Últimas mensagens da conversa (para entender "esse", "o primeiro", "e a segunda temporada?"). */
    history?: { role: "user" | "laura"; text: string }[];
    /** Títulos mostrados na resposta anterior, na ordem em que apareceram. */
    lastTitles?: { title: string; type: string }[];
  } = {}
): Promise<AssistantAnswer> {
  const channelsContext = onlineChannels.length
    ? `\n\nCanais de TV ao vivo confirmados ONLINE agora no ALXmovies (essa lista é real e atualizada — NUNCA cite um canal que não esteja nela, e NUNCA invente um canal):\n` +
      onlineChannels.map((c) => `- ${c.name}${c.group ? ` (${c.group.replace("Canais | ", "")})` : ""}`).join("\n")
    : "";
  const historyContext = watchHistory.length
    ? `\n\nHistórico real deste perfil no ALXmovies (o que a pessoa já assistiu ou favoritou — use isso só como contexto de gosto/preferência, e evite recomendar de novo um título que já está nessa lista, a menos que a pessoa peça especificamente por ele):\n` +
      watchHistory.map((h) => `- ${h.title} (${h.type === "tv" ? "série" : "filme"})`).join("\n")
    : "";
  const roomsContext = onlineRooms.length
    ? `\n\nSalas de "assistir junto" ATIVAS agora no ALXmovies (informação pública real e atualizada — NUNCA cite uma sala que não esteja nessa lista, e NUNCA invente uma):\n` +
      onlineRooms.map((r) => `- "${r.title}" — assistindo "${r.movieTitle}", anfitrião: ${r.hostName}${r.hasPassword ? " (privada, pede senha)" : " (pública)"}`).join("\n")
    : "";

  const prompt =
    `Você é a Laura, a assistente de IA do ALXmovies (o nome que aparece para a pessoa é "Laura IA"), um site de streaming de filmes, séries e canais de TV ao vivo, ` +
    `que também tem "Salas" (assistir um filme/série junto com outras pessoas ao mesmo tempo, com chat). ` +
    `Responda SEMPRE em português do Brasil, de forma breve, amigável e direta.\n\n` +
    `Sua resposta deve ser APENAS um JSON válido (sem markdown, sem texto antes ou depois, sem crases), exatamente neste formato:\n` +
    `{"reply": "texto da resposta para o usuário", "titles": [{"title": "nome real do filme/série", "year": "AAAA ou vazio", "type": "movie ou tv"}], "channels": ["nome exato do canal, se algum foi citado"], "rooms": ["nome exato da sala, se alguma foi citada"], "actions": [], "suggestions": ["até 3 sugestões curtas de próximo passo"]}\n\n` +
    `Regras:\n` +
    `- "reply": curto e direto — 1 frase apresentando a indicação (ex: "Encontrei essas opções pra você:" ou "Baseado no que você curtiu, essa aqui deve fazer seu estilo:"). NUNCA repita nome do filme, ano, gênero, nota ou sinopse dentro de "reply" — tudo isso já aparece sozinho no card de cada título logo abaixo da mensagem, então repetir deixa a resposta enorme e redundante. Só escreva uma resposta mais longa (sem essa regra de tamanho) quando a pergunta não resultar em nenhum "titles" — aí sim pode explicar, comentar ou conversar normalmente.\n` +
    `- "titles": inclua CADA filme ou série que você citar na resposta, uma vez cada, com o título original/real (para ser buscável), o ano de lançamento se souber, e "type" = "movie" para filme ou "tv" para série.\n` +
    `- Se o usuário pedir um título específico (ex: "quero assistir Interestelar"), inclua esse título em "titles" também, mesmo que você só confirme que encontrou.\n` +
    `- "channels": só existe se a pergunta for sobre canal de TV ao vivo. Cite SOMENTE nomes que apareçam exatamente na lista de canais online fornecida abaixo (se houver). Se a pergunta for sobre canais mas a lista abaixo estiver vazia ou não tiver nada relacionado, diga isso educadamente na "reply" (ex: "não encontrei canais desse tipo online agora") e deixe "channels" vazio — nunca invente.\n` +
    `- "rooms": só existe se a pergunta for sobre salas de assistir junto (ex: "tem alguma sala aberta", "quero assistir com outras pessoas", "que salas tem agora"). Cite SOMENTE nomes de sala que apareçam exatamente na lista de salas ativas fornecida abaixo (se houver). Se não houver nenhuma sala ativa, diga isso educadamente e sugira criar uma nova sala em "Salas" no menu — nunca invente uma sala.\n` +
    `- Se a pergunta não tiver nada a ver com filmes, séries, canais, salas ou entretenimento, responda educadamente nesse mesmo formato JSON, com "titles", "channels" e "rooms" como array vazio.\n` +
    `- IMPORTANTE — sinopses e resumos: sempre que for descrever a história de um filme/série (resumo, sinopse, "do que se trata"), dê uma versão SEM SPOILER por padrão — não revele o final, reviravoltas importantes da trama, nem quem morre. Só inclua esse tipo de detalhe se a pessoa pedir explicitamente ("com spoiler", "conta o final", "pode estragar", "já assisti, pode falar tudo").` +
    `\n- "actions": coisas que o app deve FAZER agora. Use SOMENTE quando a pessoa PEDIR para fazer algo (verbos como reproduzir, assistir, abrir, tocar, colocar, baixar, adicionar, marcar, avaliar, compartilhar, criar sala, entrar). Para simples recomendação ou conversa, deixe "actions" vazio []. Tipos permitidos (use exatamente estes campos):\n` +
    `  {"type":"play","title":"...","year":"AAAA ou vazio","mediaType":"movie|tv","season":número ou null,"episode":número ou null} — reproduzir/assistir um filme ou série (abre o player).\n` +
    `  {"type":"continue"} — continuar de onde parou.\n` +
    `  {"type":"open_details","title":"...","year":"","mediaType":"movie|tv"} — abrir a página do título.\n` +
    `  {"type":"trailer","title":"...","year":"","mediaType":"movie|tv"} — mostrar o trailer.\n` +
    `  {"type":"download",...mesmos campos} — baixar o filme/episódio.\n` +
    `  {"type":"add_to_list",...} / {"type":"remove_from_list",...} — adicionar/remover da Minha lista.\n` +
    `  {"type":"mark_watched",...} — marcar um FILME como visto.\n` +
    `  {"type":"rate","rating":"loved|liked|disliked",...} — avaliar (amei / gostei / não gostei).\n` +
    `  {"type":"share",...} — compartilhar o título.\n` +
    `  {"type":"create_room",...} — criar uma sala para assistir esse título.\n` +
    `  {"type":"join_room","name":"título da sala"} — entrar em uma sala (somente nomes da lista de salas ativas).\n` +
    `  {"type":"person","name":"nome do ator/diretor"} — abrir a página da pessoa com a filmografia.\n` +
    `  {"type":"play_channel","name":"nome do canal"} — abrir um canal de TV ao vivo (abre o player).\n` +
    `  {"type":"channel_now","name":"nome do canal"} — dizer o que está passando agora no canal.\n` +
    `  {"type":"goto","screen":"home|list|search|channels|rooms|friends|messages|notifications|account","query":"texto da busca, só para search"} — ir para uma tela do app.\n` +
    `  Se a pessoa disser "esse", "o primeiro", "o segundo" etc., use a lista "Títulos da resposta anterior" abaixo para saber qual é. Use o título real e completo (não abreviado). Pode haver mais de uma ação.\n` +
    `- "suggestions": até 3 frases curtas (no máximo 5 palavras) que a pessoa poderia pedir em seguida (ex: "Ver o trailer", "Algo parecido", "Adicionar à lista"). Podem ser vazias.\n` +
    channelsContext + historyContext + roomsContext +
    (lastTitles.length ? `\n\nTítulos da resposta anterior (na ordem em que apareceram):\n` + lastTitles.map((t, i) => `${i + 1}. ${t.title} (${t.type === "tv" ? "série" : "filme"})`).join("\n") : "") +
    (history.length ? `\n\nConversa recente (mais antiga primeiro):\n` + history.map((h) => `${h.role === "user" ? "Usuário" : "Laura"}: ${h.text}`).join("\n") : "") +
    `\n\nPergunta do usuário: ${question}`;

  return parseAnswer(await askGemini(prompt));
}

function parseAnswer(raw: string): AssistantAnswer {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();
  try {
    const p = JSON.parse(text);
    const strings = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);
    return {
      reply: (typeof p.reply === "string" ? p.reply.trim() : raw) || raw,
      titles: Array.isArray(p.titles)
        ? p.titles.filter((t: any) => t?.title).map((t: any) => ({ title: String(t.title).trim(), year: t.year ? String(t.year).trim() : "", type: t.type === "tv" ? "tv" : "movie" }))
        : [],
      channels: strings(p.channels),
      rooms: strings(p.rooms),
      actions: parseActions(p.actions),
      suggestions: strings(p.suggestions).slice(0, 3),
    };
  } catch {
    return { reply: raw, titles: [], channels: [], rooms: [], actions: [], suggestions: [] };
  }
}

/** Aceita só ações conhecidas e com os campos mínimos (nunca executa nada "inventado" pela IA). */
function parseActions(raw: unknown): LauraAction[] {
  if (!Array.isArray(raw)) return [];
  const out: LauraAction[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.floor(v) : v && !isNaN(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : null);
  const media = (v: unknown): "movie" | "tv" | undefined => (v === "tv" ? "tv" : v === "movie" ? "movie" : undefined);
  const SCREENS = ["home", "list", "search", "channels", "rooms", "friends", "messages", "notifications", "account"];
  for (const a of raw.slice(0, 4)) {
    const type = str(a?.type);
    const title = str(a?.title);
    const ref = { title, year: str(a?.year) || undefined, mediaType: media(a?.mediaType) };
    switch (type) {
      case "continue": out.push({ type }); break;
      case "play": if (title) out.push({ type, ...ref, season: num(a.season), episode: num(a.episode) }); break;
      case "open_details": case "trailer": case "download": case "add_to_list": case "remove_from_list": case "mark_watched": case "share": case "create_room":
        if (title) out.push({ type, ...ref }); break;
      case "rate": if (title && ["loved", "liked", "disliked"].includes(a?.rating)) out.push({ type, ...ref, rating: a.rating }); break;
      case "person": case "play_channel": case "channel_now": case "join_room": if (str(a?.name)) out.push({ type, name: str(a.name) }); break;
      case "goto": if (SCREENS.includes(a?.screen)) out.push({ type, screen: a.screen, query: str(a?.query) || undefined }); break;
    }
  }
  return out;
}
