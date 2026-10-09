import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { exitApp, initNativeChrome, isNative, onHardwareBack, runBackHandlers } from "@/lib/native";

// Telas "raiz": o botão voltar não tem para onde voltar, então pede confirmação para sair.
const ROOT_PATHS = new Set(["/", "/home", "/login", "/profiles"]);

/** Ajustes que só existem no app Android: barras do sistema, tela de abertura, botão voltar e teclado. */
export function NativeShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const lastBack = useRef(0);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!isNative) return;
    void initNativeChrome();

    const sub = onHardwareBack(() => {
      if (runBackHandlers()) return;                           // fechou modal / painel / tela cheia
      const hasHistory = (window.history.state?.idx ?? 0) > 0;
      if (hasHistory && !ROOT_PATHS.has(pathRef.current)) { navigate(-1); return; }
      if (!ROOT_PATHS.has(pathRef.current)) { navigate("/home", { replace: true }); return; }
      const now = Date.now();
      if (now - lastBack.current < 2000) { void exitApp(); return; }
      lastBack.current = now;
      setToast("Toque em voltar de novo para sair");
      setTimeout(() => setToast(""), 2000);
    });
    return () => { void sub.then((h) => h.remove()); };
  }, [navigate]);

  // Teclado aberto: esconde a barra inferior e os botões flutuantes para não cobrirem o campo de texto
  useEffect(() => {
    if (!isNative || !window.visualViewport) return;
    const vv = window.visualViewport;
    const check = () => document.documentElement.classList.toggle("kb-open", window.innerHeight - vv.height > 140);
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);

  return toast ? <div className="native-toast" role="status">{toast}</div> : null;
}
