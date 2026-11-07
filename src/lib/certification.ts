import type { MediaType } from "@/types";

export type Cert = "L" | "10" | "12" | "14" | "16" | "18";

const US_MOVIE: Record<string, Cert> = { G: "L", PG: "10", "PG-13": "12", R: "16", "NC-17": "18" };
const US_TV: Record<string, Cert> = { "TV-Y": "L", "TV-G": "L", "TV-Y7": "10", "TV-PG": "10", "TV-14": "14", "TV-MA": "18" };

function normalize(v?: string | null): Cert | null {
  if (!v) return null;
  const t = v.trim().toUpperCase();
  if (t === "L" || t === "LIVRE") return "L";
  const n = parseInt(t.replace(/\D/g, ""), 10);
  if ([10, 12, 14, 16, 18].includes(n)) return String(n) as Cert;
  return null;
}

/** Classificação indicativa do título (Brasil primeiro; se não tiver, converte a americana). `null` = sem informação. */
export function getCertification(m: any, type: MediaType): Cert | null {
  try {
    if (type === "movie") {
      const list: any[] = m?.release_dates?.results ?? [];
      const pick = (iso: string) => list.find((r) => r.iso_3166_1 === iso)?.release_dates?.map((d: any) => d.certification).find(Boolean);
      const br = normalize(pick("BR"));
      if (br) return br;
      const us = pick("US");
      if (us && US_MOVIE[us]) return US_MOVIE[us];
    } else {
      const list: any[] = m?.content_ratings?.results ?? [];
      const br = normalize(list.find((r) => r.iso_3166_1 === "BR")?.rating);
      if (br) return br;
      const us = list.find((r) => r.iso_3166_1 === "US")?.rating;
      if (us && US_TV[us]) return US_TV[us];
    }
  } catch { /* segue sem classificação */ }
  return m?.adult ? "18" : null;
}
