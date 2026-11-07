import { CONFIG } from "@/lib/config";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";

/** Última versão publicada em Releases (o workflow cria uma tag vMAIOR.MENOR.N a cada build; MAIOR.MENOR vem do arquivo version.txt). */
const RELEASE_API = CONFIG.RELEASE_API_URL;

export interface DownloadProgress { received: number; total: number; percent: number }

interface AppUpdaterPlugin {
  download(opts: { url: string; size?: number }): Promise<{ path: string }>;
  cancel(): Promise<void>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(): Promise<void>;
  cleanup(): Promise<void>;
  addListener(event: "downloadProgress", cb: (p: DownloadProgress) => void): Promise<PluginListenerHandle>;
}

/** Plugin nativo (criado por scripts/android/patch-android.mjs). */
export const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");

export interface UpdateInfo {
  version: string;   // ex.: "1.1.2"
  current: string;   // versão instalada
  url: string;       // link do .apk
  size: number;      // bytes
  notes: string;     // novidades (release-notes.md de cada versão, vindo da release no GitHub)
}

const parse = (v: string) => v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);

/** true se `a` é mais nova que `b`. */
function isNewer(a: string, b: string) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

const LIST_URL = CONFIG.RELEASE_DIRECT_URL.replace(/\/latest$/, "?per_page=15");
const GENERIC_BODY = /baixe o arquivo|apk android do alxmovies/i;

/** Se a pessoa pulou versões (ex.: 1.1.0 → 1.1.3), mostra as novidades de todas, da mais nova para a mais antiga. */
async function notesSince(current: string, latestBody: string): Promise<string> {
  try {
    const res = await fetch(LIST_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return latestBody;
    const list = await res.json() as { tag_name?: string; body?: string; draft?: boolean; prerelease?: boolean }[];
    const newer = list
      .filter((r) => !r.draft && !r.prerelease && r.tag_name && isNewer(r.tag_name, current) && (r.body ?? "").trim() && !GENERIC_BODY.test(r.body ?? ""))
      .sort((a, b) => (isNewer(a.tag_name!, b.tag_name!) ? -1 : 1));
    if (newer.length <= 1) return latestBody;
    return newer.slice(0, 6).map((r) => `# v${r.tag_name!.replace(/^v/i, "")}\n${(r.body ?? "").trim()}`).join("\n");
  } catch {
    return latestBody;
  }
}

/** Consulta o GitHub. Retorna os dados da atualização, ou null se já está na última versão (ou se der erro de rede). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const get = (u: string) => fetch(u, { headers: { Accept: "application/vnd.github+json" } });
    const [{ version: current }, first] = await Promise.all([App.getInfo(), get(RELEASE_API).catch(() => null)]);
    const res = first && first.ok ? first : await get(CONFIG.RELEASE_DIRECT_URL).catch(() => null);
    if (!res || !res.ok) return null;
    const rel = await res.json() as { tag_name?: string; body?: string; assets?: { name: string; browser_download_url: string; size: number }[] };
    const tag = rel.tag_name;
    const apk = rel.assets?.find((a) => a.name.toLowerCase().endsWith(".apk"));
    if (!tag || !apk || !isNewer(tag, current)) return null;
    const notes = await notesSince(current, (rel.body ?? "").trim());
    return { version: tag.replace(/^v/i, ""), current, url: apk.browser_download_url, size: apk.size, notes };
  } catch {
    return null; // sem internet / limite da API: tenta de novo na próxima abertura
  }
}
