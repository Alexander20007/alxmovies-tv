import { DeepLinks } from "@/components/DeepLinks";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { FullLayout, Layout } from "@/components/Layout";
import { RequireAuth, RequireProfile } from "@/components/Guards";
import { AdsLoader } from "@/components/Ads";
import { CookieConsent } from "@/components/CookieConsent";
import { NativeShell } from "@/components/NativeShell";
import { DeviceNotifications } from "@/components/DeviceNotifications";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { PageSpinner } from "@/components/Spinner";
import { isNative } from "@/lib/native";
import { OfflineShell } from "@/components/OfflineShell";
import { AnnouncementHost } from "@/components/AnnouncementHost";
import { useOfflineMode } from "@/hooks/useOfflineMode";

const Login = lazy(() => import("@/pages/Login"));
const Profiles = lazy(() => import("@/pages/Profiles"));
const Home = lazy(() => import("@/pages/Home"));
const Details = lazy(() => import("@/pages/Details"));
const Search = lazy(() => import("@/pages/Search"));
const MyList = lazy(() => import("@/pages/MyList"));
const Watch = lazy(() => import("@/pages/Watch"));
const ManageProfiles = lazy(() => import("@/pages/ManageProfiles"));
const Rooms = lazy(() => import("@/pages/Rooms"));
const Room = lazy(() => import("@/pages/Room"));
const Episodes = lazy(() => import("@/pages/Episodes"));
const Info = lazy(() => import("@/pages/Info"));
const Person = lazy(() => import("@/pages/Person"));
const Diagnostico = lazy(() => import("@/pages/Diagnostico"));
const Canal = lazy(() => import("@/pages/Canal"));
const Friends = lazy(() => import("@/pages/Friends"));
const Messages = lazy(() => import("@/pages/Messages"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Laura = lazy(() => import("@/pages/Laura"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Cookies = lazy(() => import("@/pages/Cookies"));
const Security = lazy(() => import("@/pages/Security"));
const Account = lazy(() => import("@/pages/Account"));
const Plans = lazy(() => import("@/pages/Plans"));
const DownloadsPage = lazy(() => import("@/pages/Downloads"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

export default function App() {
  const off = useOfflineMode();

  // Sem internet: abre direto nos downloads (sem login, sem perfil), como o YouTube.
  if (isNative && off.offline) {
    return (
      <Suspense fallback={<PageSpinner full />}>
        <OfflineShell canReturn={off.canReturn} checking={off.checking} onRetry={off.retry} onReturn={off.goOnline}>
          <DownloadsPage />
        </OfflineShell>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/seguranca" element={<Security />} />
        <Route element={<RequireAuth />}>
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/manage-profiles" element={<ManageProfiles />} />
          <Route element={<RequireProfile />}>
            <Route path="/watch" element={<Watch />} />
            <Route path="/sala" element={<Room />} />
            <Route path="/details" element={<Details />} />
            <Route path="/episodes" element={<Episodes />} />
            <Route path="/info" element={<Info />} />
            <Route path="/person" element={<Person />} />
            <Route path="/diagnostico" element={<Diagnostico />} />
            <Route path="/canal" element={<Canal />} />
            <Route element={<Layout />}>
              <Route path="/home" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/mylist" element={<MyList />} />
              <Route path="/salas" element={<Rooms />} />
              <Route path="/amigos" element={<Friends />} />
              <Route path="/account" element={<Account />} />
              <Route path="/planos" element={<Plans />} />
              <Route path="/downloads" element={<DownloadsPage />} />
            </Route>
            <Route element={<FullLayout />}>
              <Route path="/mensagens" element={<Messages />} />
              <Route path="/notificacoes" element={<Notifications />} />
              <Route path="/laura" element={<Laura />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <AdsLoader />
      {!isNative && <CookieConsent />}
      <NativeShell />
      <DeepLinks />
      <DeviceNotifications />
      <UpdatePrompt />
      {isNative && <AnnouncementHost />}
    </Suspense>
  );
}
