import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { isNative } from "@/lib/native";

let last = { url: "", at: 0 };

/** Links do ALXmovies (https://alxmovies.netlify.app/...) que abrem o app: leva direto para a mesma tela dentro do app. */
export function DeepLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNative) return;
    const go = (raw: string) => {
      try {
        const u = new URL(raw);
        if (!/(^|\.)alxmovies\.netlify\.app$/i.test(u.hostname)) return;
        if (raw === last.url && Date.now() - last.at < 3000) return; // o Android pode avisar duas vezes (abertura + novo link)
        last = { url: raw, at: Date.now() };
        navigate(`${u.pathname}${u.search}${u.hash}`);
      } catch { /* link inválido: ignora */ }
    };
    const sub = App.addListener("appUrlOpen", (e) => go(e.url));
    void App.getLaunchUrl().then((r) => { if (r?.url) go(r.url); }).catch(() => {});
    return () => { void sub.then((h) => h.remove()); };
  }, [navigate]);
  return null;
}
