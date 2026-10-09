import type { Profile } from "@/types";

const SHOWN_KEY = "alxmovies_birthday_shown_";
export const DEFAULT_BIRTHDAY_MESSAGE =
  "Que seu novo ano seja cheio de boas histórias, muitas maratonas e tudo o que você merece. O ALXmovies te deseja um dia incrível! 🎉";

export function isBirthdayToday(profile: Pick<Profile, "birthday"> | null | undefined, from = new Date()) {
  if (!profile?.birthday) return false;
  const b = new Date(profile.birthday + "T00:00:00");
  return !isNaN(b.getTime()) && b.getMonth() === from.getMonth() && b.getDate() === from.getDate();
}

const todayKey = (profileId: string) => {
  const d = new Date();
  return `${SHOWN_KEY}${profileId}_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
export const wasBirthdayShownToday = (profileId: string) => { try { return !!localStorage.getItem(todayKey(profileId)); } catch { return false; } };
export const markBirthdayShown = (profileId: string) => { try { localStorage.setItem(todayKey(profileId), "1"); } catch { /* ignore */ } };

export function buildBirthdayPrompt(name: string, taste: string[]) {
  const tasteLine = taste.length > 0
    ? `Coisas que ${name} mais assiste no ALXmovies, do mais recente pro mais antigo: ${taste.join(", ")}.`
    : `Ainda não temos histórico de filmes/séries assistidos por ${name}.`;
  return (
    `Escreva uma mensagem curta e calorosa de feliz aniversário para ${name}, para o app de streaming ALXmovies. ${tasteLine}\n\n` +
    `Regras:\n` +
    `- 2 a 3 frases, tom leve e animado, pode usar 1-2 emojis (não exagerar).\n` +
    `- Se houver itens na lista, cite UM filme/série específico dela (ou o gênero/tema em comum entre eles) de forma natural, ` +
    `como se fosse uma piadinha carinhosa ou uma sugestão pro dia — sem citar mais de um título.\n` +
    `- Se não houver histórico, não invente títulos: escreva algo genérico e caloroso sobre maratonar boas histórias.\n` +
    `- Fale diretamente com a pessoa (2ª pessoa), nunca em 3ª pessoa.\n` +
    `- NUNCA use markdown (sem **, sem listas, sem #).\n` +
    `- Responda só com o texto final da mensagem, nada antes ou depois.`
  );
}
