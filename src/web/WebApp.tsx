import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./Landing";
import ShareLanding from "./ShareLanding";
import WebLogin from "./pages/WebLogin";
import WebWheel from "./pages/WebWheel";
import WebPlans from "./pages/WebPlans";
import WebAccount from "./pages/WebAccount";
import WebAdminQuiz from "./pages/WebAdminQuiz";
import WebAdminPanel from "./pages/WebAdminPanel";

const Privacy = lazy(() => import("@/pages/Privacy"));
const Cookies = lazy(() => import("@/pages/Cookies"));
const Security = lazy(() => import("@/pages/Security"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

/** Site: vitrine + download do app + conta (login), planos e roda da sorte. Sem player. */
export default function WebApp() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/entrar" element={<WebLogin />} />
        <Route path="/roda" element={<WebWheel />} />
        <Route path="/planos" element={<WebPlans />} />
        <Route path="/conta" element={<WebAccount />} />
        <Route path="/admin/teste" element={<WebAdminQuiz />} />
        <Route path="/admin" element={<WebAdminPanel />} />
        <Route path="/baixar" element={<Navigate to="/" replace />} />
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/seguranca" element={<Security />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {["/details", "/info", "/episodes", "/watch", "/person", "/canal", "/sala", "/salas"].map((p) => <Route key={p} path={p} element={<ShareLanding />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
