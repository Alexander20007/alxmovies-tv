import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { RequireAuth, RequireProfile } from "@/components/Guards";
import { AdsLoader } from "@/components/Ads";
import { CookieConsent } from "@/components/CookieConsent";
import { NativeShell } from "@/components/NativeShell";
import { GlobalBusyIndicator, PageSpinner } from "@/components/Spinner";
import { isNative } from "@/lib/native";

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
const Friends = lazy(() => import("@/pages/Friends"));
const Messages = lazy(() => import("@/pages/Messages"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Cookies = lazy(() => import("@/pages/Cookies"));
const Security = lazy(() => import("@/pages/Security"));
const Account = lazy(() => import("@/pages/Account"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

export default function App() {
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
            <Route element={<Layout />}>
              <Route path="/home" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/mylist" element={<MyList />} />
              <Route path="/salas" element={<Rooms />} />
              <Route path="/amigos" element={<Friends />} />
              <Route path="/mensagens" element={<Messages />} />
              <Route path="/account" element={<Account />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <AdsLoader />
      {!isNative && <CookieConsent />}
      <NativeShell />
      <GlobalBusyIndicator />
    </Suspense>
  );
}
