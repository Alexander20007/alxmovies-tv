import { useEffect } from "react";
import { enterImmersiveLandscape, exitImmersive, isNative } from "@/lib/native";

/** Enquanto ativo: gira para paisagem e esconde as barras do sistema (player de vídeo). Ao sair, volta ao normal. */
export function useImmersiveLandscape(active: boolean) {
  useEffect(() => {
    if (!isNative || !active) return;
    void enterImmersiveLandscape();
    return () => { void exitImmersive(); };
  }, [active]);
}
