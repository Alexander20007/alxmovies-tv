import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { isBiometricEnabled, isUnlockedThisTab, verifyBiometric } from "@/lib/biometric";

/** Tela de bloqueio por biometria neste dispositivo (uma vez por aba). */
export function BiometricLock({ userId, onUnlock }: { userId: string; onUnlock: () => void }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const tried = useRef(false);

  async function unlock() {
    setBusy(true); setError(false);
    try { await verifyBiometric(userId); setUnlocked(true); onUnlock(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!tried.current) { tried.current = true; void unlock(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (unlocked) return null;
  return (
    <div className="biometric-lock-overlay">
      <div className="biometric-lock-box">
        <div className="biometric-lock-icon">🔐</div>
        <h1>ALXmovies bloqueado</h1>
        <p>Confirme sua biometria para continuar neste dispositivo.</p>
        {error && <p className="biometric-lock-error" style={{ display: "block" }}>Não foi possível confirmar. Tente novamente.</p>}
        <button className="account-btn" disabled={busy} style={{ alignSelf: "stretch", justifyContent: "center" }} onClick={() => void unlock()}>
          {busy ? "Verificando..." : "👆 Desbloquear com biometria"}
        </button>
        <button className="account-btn secondary" style={{ alignSelf: "stretch", justifyContent: "center" }}
          onClick={() => void signOut().then(() => navigate("/login", { replace: true }))}>Sair e entrar com senha</button>
      </div>
    </div>
  );
}

export const needsBiometric = (userId?: string | null) => isBiometricEnabled(userId) && !isUnlockedThisTab();
