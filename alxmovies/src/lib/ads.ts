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
