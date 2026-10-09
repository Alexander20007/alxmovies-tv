import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useParentalLock } from "@/hooks/useParentalLock";
import { BiometricLock, needsBiometric } from "@/components/BiometricLock";
import { FloatingWidgets } from "@/components/FloatingWidgets";

const Splash = () => <div style={{ padding: 40, color: "#fff" }}>Carregando…</div>;

/** Exige usuário logado (equivalente ao requireAuth do site antigo). */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [bioUnlocked, setBioUnlocked] = useState(false);
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!bioUnlocked && needsBiometric(user.id)) return <BiometricLock userId={user.id} onUnlock={() => setBioUnlocked(true)} />;
  return <Outlet />;
}

/** Exige usuário logado + perfil ativo (equivalente ao requireProfile). */
export function RequireProfile() {
  const { loading, activeProfile } = useProfile();
  const location = useLocation();
  const locked = useParentalLock(activeProfile);
  if (loading) return <Splash />;
  if (locked) return <Navigate to="/profiles" replace state={{ timelocked: true }} />;
  if (!activeProfile) return <Navigate to="/profiles" replace state={{ from: location.pathname + location.search }} />;
  return (
    <>
      <Outlet />
      <FloatingWidgets />
    </>
  );
}
