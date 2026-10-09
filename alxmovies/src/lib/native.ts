import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Clipboard } from "@capacitor/clipboard";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { installRipple } from "./ripple";

/** true quando roda dentro do app Android (Capacitor); false no navegador/Netlify. */
export const isNative = Capacitor.isNativePlatform();

// ---------- inicialização ----------
export async function initNativeChrome() {
  document.documentElement.classList.add("native");
  installRipple();
  try { await SystemBars.setStyle({ style: SystemBarsStyle.Dark }); } catch { /* sem suporte */ }
  try { await SplashScreen.hide(); } catch { /* já fechou */ }
}

// ---------- botão "voltar" do Android ----------
type BackHandler = () => boolean | void;
const backStack: BackHandler[] = [];

/** Registra algo que o botão voltar deve fechar primeiro (modal, painel, tela cheia). Retorna a função de remover. */
export function pushBackHandler(fn: BackHandler) {
  backStack.push(fn);
  return () => {
    const i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
  };
}
/** Chama o item mais recente da pilha. Retorna true se alguém tratou o "voltar". */
export function runBackHandlers() {
  for (let i = backStack.length - 1; i >= 0; i--) {
    if (backStack[i]() !== false) return true;
  }
  return false;
}
export const onHardwareBack = (cb: () => void) => App.addListener("backButton", cb);
export const exitApp = () => App.exitApp();
export const onAppResume = (cb: () => void) => App.addListener("resume", cb);

// ---------- tela cheia / orientação ----------
export async function enterImmersiveLandscape() {
  if (!isNative) return;
  try { await ScreenOrientation.lock({ orientation: "landscape" }); } catch { /* ignore */ }
  try { await SystemBars.hide(); } catch { /* ignore */ }
}
export async function exitImmersive() {
  if (!isNative) return;
  try { await SystemBars.show(); } catch { /* ignore */ }
  try { await ScreenOrientation.lock({ orientation: "portrait" }); } catch { /* ignore */ }
}

// ---------- compartilhar / copiar / abrir link ----------
export async function copyText(text: string) {
  try {
    if (isNative) await Clipboard.write({ string: text });
    else await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}

/** Abre a folha de compartilhamento do Android; no navegador usa o share do navegador ou copia o link. */
export async function shareLink(opts: { title?: string; text?: string; url: string }): Promise<"shared" | "copied" | "failed"> {
  try {
    if (isNative) {
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: "Compartilhar" });
      return "shared";
    }
    if (navigator.share) { await navigator.share(opts); return "shared"; }
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "AbortError" || /cancel/i.test(String((e as Error)?.message))) return "shared"; // usuário fechou a folha
  }
  return (await copyText(opts.text ? `${opts.text}\n${opts.url}` : opts.url)) ? "copied" : "failed";
}

export async function openExternal(url: string) {
  if (isNative) { try { await Browser.open({ url }); return; } catch { /* cai no window.open */ } }
  window.open(url, "_blank", "noopener");
}
