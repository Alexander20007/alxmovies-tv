import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { CONFIG } from "@/lib/config";
import { formatHHMM, getGuestMsRemaining } from "@/lib/guest";
import { storage } from "@/lib/storage";
import { generateGuestRecoveryCode, upgradeGuestAccount } from "@/services/account";
import { copyText } from "@/lib/native";
import { useBackClose } from "@/hooks/useBackClose";
import { BusyButton } from "@/components/Spinner";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado");

function useRemaining() {
  const [ms, setMs] = useState(getGuestMsRemaining);
  useEffect(() => {
    const t = setInterval(() => setMs(getGuestMsRemaining()), 30000);
    return () => clearInterval(t);
  }, []);
  return ms;
}

function CodeModal({ onClose }: { onClose: () => void }) {
  useBackClose(true, onClose);
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    generateGuestRecoveryCode().then((c) => alive && setCode(c)).catch((e) => alive && setStatus("Erro: " + errMsg(e)));
    return () => { alive = false; };
  }, []);

  async function copy() {
    setStatus((await copyText(code!)) ? "Copiado! Guarde em um lugar seguro." : "Não deu pra copiar automaticamente — selecione o código à mão.");
  }

  return (
    <div className="guest-code-overlay" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="guest-code-box">
        <button className="guest-code-close" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="guest-code-icon">🔑</div>
        <h2>Seu código de acesso</h2>
        <p>Guarde esse código em um lugar seguro (print, anotação, etc). Com ele, você volta pra esse mesmo perfil de convidado em qualquer navegador ou aparelho — mesmo limpando os dados daqui — mas só até completar 24h desde que essa sessão começou.</p>
        <div className="guest-code-value">{code ?? (status.startsWith("Erro") ? "—" : "Carregando...")}</div>
        <button className="account-btn" style={{ alignSelf: "stretch", justifyContent: "center" }} disabled={!code} onClick={() => void copy()}>Copiar código</button>
        <p className="guest-code-status">{status}</p>
      </div>
    </div>
  );
}

function GuestPanel({ onClose }: { onClose: () => void }) {
  useBackClose(true, onClose);
  const { signOut } = useAuth();
  const { profiles } = useProfile();
  const navigate = useNavigate();
  const ms = useRemaining();
  const [codeOpen, setCodeOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const fraction = Math.max(0, Math.min(1, ms / CONFIG.GUEST_SESSION_MS));
  const circumference = 2 * Math.PI * 52;
  const started = storage.getGuestStartedAt();
  const startedLabel = started ? new Date(started).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  async function upgrade(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !username.trim() || !password) return setError("Preencha todos os campos.");
    if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    setBusy(true);
    try { await upgradeGuestAccount({ email: email.trim(), password, username: username.trim() }); setDone(true); }
    catch (err) { setError("Não foi possível criar a conta: " + errMsg(err)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="guest-code-overlay" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="guest-panel-box">
          <button className="guest-code-close" aria-label="Fechar" onClick={onClose}>✕</button>
          <div className="guest-panel-ring-wrap">
            <svg className="guest-panel-ring" viewBox="0 0 120 120">
              <circle className="guest-panel-ring-bg" cx="60" cy="60" r="52" />
              <circle className="guest-panel-ring-fg" cx="60" cy="60" r="52"
                style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - fraction), stroke: fraction <= 1 / 24 ? "#ff4d4f" : "#ff2d55" }} />
            </svg>
            <div className="guest-panel-ring-label"><strong>{formatHHMM(ms)}</strong><span>restante</span></div>
          </div>
          <h2>Painel do convidado</h2>
          <p className="guest-panel-desc">Você está navegando sem cadastro. Seus dados (perfis, favoritos, histórico) somem quando essa sessão expirar — a não ser que você guarde um código de acesso ou crie uma conta.</p>
          <div className="guest-panel-stats">
            <div className="guest-panel-stat"><strong>{profiles.length}</strong><span>perfil{profiles.length === 1 ? "" : "is"} criado{profiles.length === 1 ? "" : "s"}</span></div>
            <div className="guest-panel-stat"><strong>{startedLabel}</strong><span>início da sessão</span></div>
          </div>

          {!upgrading ? (
            <div className="guest-panel-actions" style={{ display: "flex" }}>
              <button className="account-btn" style={{ justifyContent: "center" }} onClick={() => setCodeOpen(true)}>🔑 Ver / gerar código de acesso</button>
              <button className="account-btn secondary" style={{ justifyContent: "center" }} onClick={() => setUpgrading(true)}>✨ Criar conta e manter meus dados</button>
              <button className="account-btn secondary" style={{ justifyContent: "center" }} onClick={() => void signOut().then(() => navigate("/login"))}>Sair desta sessão</button>
            </div>
          ) : (
            <form className="guest-panel-upgrade-form" style={{ display: "flex" }} onSubmit={(e) => void upgrade(e)}>
              <input type="email" placeholder="Seu e-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <input type="text" placeholder="Nome de usuário" maxLength={24} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              <input type="password" placeholder="Crie uma senha (mín. 6 caracteres)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <p className="auth-error" style={{ display: "block" }}>{error}</p>}
              {done && <p className="auth-message" style={{ display: "block" }}>Quase lá! Enviamos um link de confirmação para o seu e-mail — depois de confirmar, é só entrar com esse e-mail e senha que seus perfis e favoritos continuam do jeito que estão.</p>}
              {!done && (
                <div className="guest-confirm-actions">
                  <button type="button" className="account-btn secondary" onClick={() => setUpgrading(false)}>Cancelar</button>
                  <BusyButton className="account-btn" loading={busy}>{busy ? "Criando..." : "Criar conta"}</BusyButton>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
      {codeOpen && <CodeModal onClose={() => setCodeOpen(false)} />}
    </>
  );
}

/** Botão flutuante com o tempo que resta da sessão de convidado + painel do convidado. */
export function GuestWidget() {
  const { user } = useAuth();
  const ms = useRemaining();
  const [open, setOpen] = useState(false);
  if (!user?.is_anonymous) return null;
  return (
    <>
      <button type="button" className={`guest-widget${ms > 0 && ms <= 3600000 ? " guest-widget-urgent" : ""}`} aria-label="Painel do convidado" onClick={() => setOpen(true)}>
        <span className="guest-widget-icon">👤</span>
        <span className="guest-widget-time">{formatHHMM(ms)}</span>
        <span className="guest-widget-caption">restante</span>
      </button>
      {open && <GuestPanel onClose={() => setOpen(false)} />}
    </>
  );
}
