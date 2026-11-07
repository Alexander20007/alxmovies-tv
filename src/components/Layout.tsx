import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AiFab } from "./AiAssistant";
import { BottomNav, Header } from "./Header";
import { NativeNavBar, NAV_VISIBLE_ON } from "./NativeNavBar";
import { NativeTopBar } from "./NativeTopBar";
import { SiteFooter } from "./SiteFooter";
import { isNative } from "@/lib/native";

/** Layout do app Android: barra superior + conteúdo + barra de navegação inferior. */
function NativeLayout() {
  const { pathname } = useLocation();

  // o CSS usa estes atributos para reservar o espaço das barras
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.topbar = "on";
    root.dataset.nav = NAV_VISIBLE_ON.has(pathname) ? "on" : "off";
    return () => { delete root.dataset.topbar; delete root.dataset.nav; };
  }, [pathname]);

  return (
    <>
      <NativeTopBar />
      <div key={pathname} className="route-enter"><Outlet /></div>
      <NativeNavBar />
      <AiFab />
    </>
  );
}

/** App: telas cheias (mensagens, notificações, Laura IA) — sem barra superior nem inferior, cada tela tem o seu cabeçalho. */
function NativeFullScreen() {
  const { pathname } = useLocation();
  useEffect(() => {
    const root = document.documentElement;
    delete root.dataset.topbar;
    root.dataset.nav = "off";
    root.dataset.bleed = "on";
    return () => { delete root.dataset.nav; root.dataset.bleed = "off"; };
  }, [pathname]);
  return <div key={pathname} className="route-enter-full"><Outlet /></div>;
}

function WebLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <SiteFooter />
      <BottomNav />
      <AiFab />
    </>
  );
}

export function Layout() {
  return isNative ? <NativeLayout /> : <WebLayout />;
}

/** Rotas que ocupam a tela toda no app (no site continuam dentro do layout normal). */
export function FullLayout() {
  return isNative ? <NativeFullScreen /> : <WebLayout />;
}
