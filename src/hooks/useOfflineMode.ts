import { useCallback, useEffect, useRef, useState } from "react";
import { isNative } from "@/lib/native";
import { hasInternet } from "@/lib/connectivity";

/**
 * Modo offline do app (como o YouTube): sem internet o app abre direto nos downloads, sem passar por login/perfil.
 * - abre offline → já começa no modo offline (sem tela de carregamento infinita);
 * - abre online mas a internet não funciona → testa em segundo plano e troca para o modo offline;
 * - a internet cair no meio do uso → troca na hora.
 * Voltar ao app normal é sempre uma escolha da pessoa (botão), para não tirá-la da tela de repente.
 */
export function useOfflineMode() {
  const [offline, setOffline] = useState(() => isNative && typeof navigator !== "undefined" && navigator.onLine === false);
  const [canReturn, setCanReturn] = useState(false);
  const [checking, setChecking] = useState(false);
  const offlineRef = useRef(offline);
  offlineRef.current = offline;

  // teste inicial em segundo plano + queda de conexão
  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    void hasInternet().then((ok) => { if (alive && !ok) setOffline(true); });
    const down = () => setOffline(true);
    window.addEventListener("offline", down);
    return () => { alive = false; window.removeEventListener("offline", down); };
  }, []);

  // estando offline: descobre sozinho quando a internet volta (mostra o botão "Voltar ao ALXmovies")
  useEffect(() => {
    if (!offline) { setCanReturn(false); return; }
    let alive = true;
    const probe = () => { void hasInternet().then((ok) => { if (alive && ok) setCanReturn(true); }); };
    window.addEventListener("online", probe);
    const t = setInterval(probe, 15000);
    return () => { alive = false; window.removeEventListener("online", probe); clearInterval(t); };
  }, [offline]);

  /** "Tentar de novo": testa agora; se tiver internet, volta ao app normal. */
  const retry = useCallback(async () => {
    setChecking(true);
    const ok = await hasInternet();
    setChecking(false);
    if (ok) { setOffline(false); setCanReturn(false); }
    return ok;
  }, []);

  const goOnline = useCallback(() => { setOffline(false); setCanReturn(false); }, []);

  return { offline, canReturn, checking, retry, goOnline };
}
