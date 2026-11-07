import { useQuery } from "@tanstack/react-query";
import { CONFIG } from "@/lib/config";

export const APP_PACKAGE = "com.alxmovies.app";
export const FALLBACK_APK = "https://github.com/Alexander20007/alxmovies-tv/releases/latest/download/ALXmovies.apk";

export interface ReleaseInfo { version: string; apkUrl: string; sizeMb: number; downloads: number; date: string; notes: string[] }

async function fetchRelease(): Promise<ReleaseInfo> {
  const get = (u: string) => fetch(u, { headers: { Accept: "application/vnd.github+json" } });
  let res = await get(CONFIG.RELEASE_DIRECT_URL).catch(() => null);
  if (!res || !res.ok) res = await get(CONFIG.RELEASE_API_URL).catch(() => null);
  if (!res || !res.ok) throw new Error("release");
  const rel = await res.json() as { tag_name?: string; published_at?: string; body?: string; assets?: { name: string; browser_download_url: string; size: number; download_count?: number }[] };
  const apk = rel.assets?.find((a) => a.name.toLowerCase().endsWith(".apk"));
  const notes = (rel.body ?? "").split(/\r?\n/).map((l) => l.replace(/^[\s>#*\u2022-]+/, "").replace(/^\d+[.)]\s+/, "").replace(/[*_`]/g, "").trim())
    .filter((l) => l && !/^full changelog/i.test(l) && !/^apk android do alxmovies/i.test(l)).slice(0, 8);
  return {
    version: (rel.tag_name ?? "").replace(/^v/, ""),
    apkUrl: apk?.browser_download_url ?? FALLBACK_APK,
    sizeMb: apk ? Math.round((apk.size / 1048576) * 10) / 10 : 0,
    downloads: apk?.download_count ?? 0,
    date: rel.published_at ?? "",
    notes,
  };
}

/** Versão mais recente do app (GitHub Releases). Se não carregar, o botão usa o link direto do último APK. */
export function useRelease() {
  const q = useQuery({ queryKey: ["web-release"], queryFn: fetchRelease, staleTime: 10 * 60_000, retry: 1 });
  return { info: q.data ?? null, apkUrl: q.data?.apkUrl ?? FALLBACK_APK, loading: q.isLoading };
}

export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isDesktop = () => !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
export const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
