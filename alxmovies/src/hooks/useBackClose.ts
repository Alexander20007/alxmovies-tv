import { useEffect, useRef } from "react";
import { isNative, pushBackHandler } from "@/lib/native";

/** No Android, faz o botão voltar fechar este item (modal, painel…) antes de sair da tela. */
export function useBackClose(active: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!isNative || !active) return;
    return pushBackHandler(() => { ref.current(); return true; });
  }, [active]);
}
