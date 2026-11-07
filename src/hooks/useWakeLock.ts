import { useEffect } from "react";

/** Mantém a tela acesa enquanto assiste (Wake Lock API, funciona no WebView do Android 10+). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!active || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      try { const l = await nav.wakeLock!.request("screen"); if (cancelled) void l.release(); else lock = l; } catch { /* sem permissão/bateria baixa */ }
    };
    void acquire();
    // o sistema solta o lock quando o app vai para segundo plano; pega de novo ao voltar
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); void lock?.release(); };
  }, [active]);
}
