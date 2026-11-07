import { registerPlugin } from "@capacitor/core";

interface AlxDownloadPlugin {
  openCast(): Promise<void>;
}
const Native = registerPlugin<AlxDownloadPlugin>("AlxDownload");

export const DOWNLOAD_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

/** Nome de arquivo sem caracteres proibidos. */
export function cleanFileName(s: string) {
  return s.replace(/[:]+/g, " -").replace(/[\\/*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "ALXmovies";
}

/** Abre as configurações de transmissão (cast) do Android. */
export const openCastSettings = () => Native.openCast().catch(() => {});
