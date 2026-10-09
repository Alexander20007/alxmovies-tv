import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AiAssistant } from "./AiAssistant";
import { BottomNav, Header } from "./Header";
import { NativeNavBar, NAV_VISIBLE_ON } from "./NativeNavBar";
import { NativeTopBar } from "./NativeTopBar";
import { SiteFooter } from "./SiteFooter";
import { isNative } from "@/lib/native";

/** Layout do app Android: barra superior + conteúdo + barra de navegação inferior (Material 3). */
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
      <AiAssistant />
    </>
  );
}

function WebLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <SiteFooter />
      <BottomNav />
      <AiAssistant />
    </>
  );
}

export function Layout() {
  return isNative ? <NativeLayout /> : <WebLayout />;
}
