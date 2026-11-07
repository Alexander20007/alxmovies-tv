import { registerPlugin } from "@capacitor/core";
import { CONFIG } from "./config";
import { isNative } from "./native";

// Anúncios só aparecem para quem está numa sessão de convidado; contas normais não veem nenhum.
let adsLoaded = false;
let popunderTriggered = false;

function appendScript(src: string, opts: { async?: boolean; crossOrigin?: string } = {}) {
  const s = document.createElement("script");
  s.src = src;
  if (opts.async) s.async = true;
  if (opts.crossOrigin) s.crossOrigin = opts.crossOrigin;
  document.head.appendChild(s);
}

export function loadAdsForGuest() {
  if (isNative || adsLoaded) return;
  adsLoaded = true;
  appendScript("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7077223794117969", { async: true, crossOrigin: "anonymous" });
  appendScript("https://pl30985121.profitableratecpmnetwork.com/1f/7b/f9/1f7bf9cd0034b71632dd37aa9bde3e0b.js");
}

export function triggerPopunderOnPlay() {
  if (isNative || popunderTriggered) return;
  popunderTriggered = true;
  appendScript("https://pl30985122.profitableratecpmnetwork.com/59/57/05/595705690e8a90c8a2904755219af8f3.js");
}


// ============================================================================
// APP ANDROID — Start.io (plugin nativo "AlxAds"). Só o plano Grátis vê anúncios; perfil Kids nunca vê.
// ============================================================================
interface AlxAdsPlugin {
  init(o: {
    appId: string; unityGameId: string; unityInterstitial: string; unityRewarded: string; unityBanner: string;
    testMode: boolean; primary: string; strategy: string;
  }): Promise<{ ok: boolean; startio?: boolean; unity?: boolean }>;
  showInterstitial(): Promise<{ shown: boolean }>;
  showRewarded(): Promise<{ completed: boolean; error?: string }>;
  showBanner(): Promise<{ heightDp: number }>;
  hideBanner(): Promise<void>;
}
const Native = registerPlugin<AlxAdsPlugin>("AlxAds");

let initP: Promise<boolean> | null = null;
export function initAds(): Promise<boolean> {
  if (!isNative) return Promise.resolve(false);
  if (!initP) {
    const a = CONFIG.ADS;
    initP = Native.init({
      appId: a.START_IO.APP_ID, unityGameId: a.UNITY.GAME_ID, unityInterstitial: a.UNITY.INTERSTITIAL,
      unityRewarded: a.UNITY.REWARDED, unityBanner: a.UNITY.BANNER,
      testMode: a.TEST_MODE, primary: a.PRIMARY, strategy: a.STRATEGY,
    })
      .then((r) => !!r.ok).catch(() => false);
  }
  return initP;
}

// ----- tela cheia (intersticial): ALEATÓRIO, com intervalo mínimo e limite por sessão para não irritar -----
const MIN_GAP_MS = 4 * 60_000;     // no mínimo 4 min entre dois anúncios
const MAX_PER_SESSION = 6;
let lastAt = 0, shownCount = 0, showing = false;

/** Sorteia se mostra um anúncio de tela cheia agora. chance = 0..1. Nunca durante vídeo (chame só em telas de navegação). */
export async function maybeShowInterstitial(chance: number): Promise<boolean> {
  if (!isNative || showing || shownCount >= MAX_PER_SESSION) return false;
  if (Date.now() - lastAt < MIN_GAP_MS) return false;
  if (Math.random() >= chance) return false;
  if (!(await initAds())) return false;
  showing = true;
  try {
    const r = await Native.showInterstitial();
    if (r.shown) { lastAt = Date.now(); shownCount++; }
    return r.shown;
  } catch { return false; } finally { showing = false; }
}

/** Anúncio premiado (a pessoa escolhe assistir). true = assistiu até o fim. */
export async function showRewardedAd(): Promise<{ completed: boolean; error?: string }> {
  if (!(await initAds())) return { completed: false, error: "init" };
  try { const r = await Native.showRewarded(); if (r.completed) lastAt = Date.now(); return r; }
  catch { return { completed: false, error: "fail" }; }
}

// ----- banner (rodapé), só nas telas escolhidas -----
export async function setBanner(on: boolean): Promise<void> {
  if (!isNative) return;
  const root = document.documentElement;
  if (!on) {
    root.dataset.banner = "off"; root.style.setProperty("--ad-h", "0px");
    try { await Native.hideBanner(); } catch { /* ignora */ }
    return;
  }
  if (!(await initAds())) return;
  try {
    const r = await Native.showBanner();
    root.dataset.banner = "on"; root.style.setProperty("--ad-h", `${r.heightDp || 50}px`);
  } catch { /* sem anúncio agora: a tela continua normal */ }
}
