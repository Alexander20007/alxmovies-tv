/** Espelha a regra do banco (is_reserved_name) só para avisar a pessoa na hora; quem barra de verdade é o banco. */
const FROM = "áàâãäéèêëíìîïóòôõöúùûüçñ0134578@$l";
const TO = "aaaaaeeeeiiiiooooouuuucnoieastbasi";
export function normName(t: string): string {
  let out = "";
  for (const ch of t.toLowerCase()) { const i = FROM.indexOf(ch); out += i >= 0 ? TO[i] : ch; }
  return out.replace(/[^a-z0-9]/g, "");
}
export function isReservedName(t: string): boolean {
  return /(admin|moderador|moderator|aixmovie|oficiai|suporte|verificad)/.test(normName(t)) || /[✔✓✅☑🗸]/u.test(t) || /[\u0370-\u03FF\u0400-\u04FF]/.test(t);
}
export const RESERVED_MSG = "Esse nome é reservado para admins verificados. Escolha outro nome.";
