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

  // Player e sala: o vídeo desenha por trás da status bar (as outras telas começam abaixo dela)
  useEffect(() => {
    if (!isNative) return;
    document.documentElement.dataset.bleed = pathname === "/watch" || pathname === "/sala" ? "on" : "off";
  }, [pathname]);

  // Teclado aberto: esconde a barra inferior e os botões flutuantes para não cobrirem o campo de texto.
  // Também publica --kb-h (altura do teclado) e --vvh (altura visível) para o painel do assistente de IA
  // subir junto com o teclado e o campo de digitar nunca ficar escondido.
  useEffect(() => {
    if (!isNative || !window.visualViewport) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const check = () => {
      root.classList.toggle("kb-open", window.innerHeight - vv.height > 140);
      root.style.setProperty("--kb-h", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    };
    check();
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    return () => {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
      root.style.removeProperty("--kb-h");
      root.style.removeProperty("--vvh");
    };
  }, []);

  return toast ? <div className="native-toast" role="status">{toast}</div> : null;
}
