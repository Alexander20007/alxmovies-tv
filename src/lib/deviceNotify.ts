import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNative } from "./native";

export interface NotifyTap { kind: "message" | "friend_request" | "friend_accepted" | "app_update"; fid?: string }

interface AlxNotifyPlugin {
  requestPermission(): Promise<{ granted: boolean }>;
  status(): Promise<{ granted: boolean }>;
  setSession(o: { url: string; key: string; token: string; proxy?: string }): Promise<void>;
  clearSession(): Promise<void>;
  showMessage(o: { fid: string; pid: string; name: string; text: string; ts: number; mid?: string }): Promise<void>;
  showFriendEvent(o: { kind: "friend_request" | "friend_accepted"; fid: string; pid: string; name: string; nid?: string }): Promise<void>;
  getPushToken(): Promise<{ token: string }>;
  cancelAll(): Promise<void>;
  addListener(event: "tap", cb: (e: NotifyTap) => void): Promise<PluginListenerHandle>;
}

// Plugin nativo gerado por scripts/android/patch-android.mjs (AlxNotifyPlugin.java). No navegador nada disso existe.
const Native = registerPlugin<AlxNotifyPlugin>("AlxNotify");

/** Tudo é "melhor esforço": se o plugin não existir (site no navegador, APK antigo), nada acontece e nada quebra. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isNative) return fallback;
  try { return await fn(); } catch { return fallback; }
}

export const deviceNotify = {
  requestPermission: () => safe(() => Native.requestPermission(), { granted: false }),
  setSession: (o: { url: string; key: string; token: string; proxy?: string }) => safe(() => Native.setSession(o), undefined),
  clearSession: () => safe(() => Native.clearSession(), undefined),
  /** "mid"/"nid" evitam notificar duas vezes o mesmo item (tempo real + push). */
  showMessage: (o: { fid: string; pid: string; name: string; text: string; ts: number; mid?: string }) => safe(() => Native.showMessage(o), undefined),
  showFriendEvent: (o: { kind: "friend_request" | "friend_accepted"; fid: string; pid: string; name: string; nid?: string }) => safe(() => Native.showFriendEvent(o), undefined),
  /** Token do Firebase deste aparelho ("" se o APK foi compilado sem Firebase). */
  getPushToken: async () => (await safe(() => Native.getPushToken(), { token: "" })).token,
  cancelAll: () => safe(() => Native.cancelAll(), undefined),
  /** Toque numa notificação (também entrega o toque que abriu o app do zero). Retorna a função que remove o ouvinte. */
  onTap(cb: (e: NotifyTap) => void): () => void {
    if (!isNative) return () => {};
    let handle: PluginListenerHandle | null = null;
    let removed = false;
    Native.addListener("tap", cb).then((h) => { if (removed) void h.remove(); else handle = h; }).catch(() => {});
    return () => { removed = true; void handle?.remove(); };
  },
};
