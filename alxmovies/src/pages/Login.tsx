import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AuthBackground } from "@/components/AuthBackground";
import { useAuth } from "@/context/AuthContext";
import { redeemGuestRecoveryCode, requestPasswordReset } from "@/services/account";
import { BusyButton } from "@/components/Spinner";

type Mode = "login" | "signup" | "forgot";

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "User already registered": "Já existe uma conta com esse e-mail.",
  "Email not confirmed": "Confirme seu e-mail antes de entrar.",
};
const translate = (msg: string) => ERRORS[msg] ?? msg;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado");

const COPY: Record<Mode, { title: string; subtitle: string; submit: string; switchText: string; switchLink: string }> = {
  login: { title: "Bem-vindo de volta", subtitle: "Entre para continuar assistindo.", submit: "Entrar", switchText: "Novo por aqui?", switchLink: "Criar conta" },
  signup: { title: "Criar sua conta", subtitle: "Leva menos de um minuto.", submit: "Cadastrar", switchText: "Já tem conta?", switchLink: "Entrar" },
  forgot: { title: "Recuperar senha", subtitle: "Enviamos um link para você criar uma nova senha.", submit: "Enviar link de recuperação", switchText: "Lembrou a senha?", switchLink: "Voltar para o login" },
};

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return { pct: [0, 25, 55, 80, 100][score], color: ["#ff2d55", "#ff2d55", "#e0a11c", "#e0a11c", "#2e9e4a"][score] };
}

export default function Login() {
  const { user, signIn, signUp, signInAsGuest } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/home";

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [guestOpen, setGuestOpen] = useState(false);
  const [guestStep, setGuestStep] = useState<"choice" | "code">("choice");
  const [guestCode, setGuestCode] = useState("");
  const [guestError, setGuestError] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);

  useEffect(() => {
    if (params.get("expired") === "guest") setMessage("Sua sessão de convidado expirou depois de 24 horas. Entre de novo ou crie uma nova sessão de convidado.");
    if (params.get("reset") === "success") setMessage("Senha atualizada! Entre com a nova senha.");
  }, [params]);

  if (user) return <Navigate to="/profiles" replace state={{ from }} />;

  const copy = COPY[mode];
  const toProfiles = () => navigate("/profiles", { replace: true, state: { from } });
  const changeMode = (m: Mode) => { setMode(m); setError(""); setMessage(""); };
  const fail = (m: string) => { setError(m); setMessage(""); };

  async function submit() {
    setError(""); setMessage("");
    const mail = email.trim();

    if (mode === "forgot") {
      if (!mail) return fail("Digite seu e-mail.");
      setBusy(true);
      try { await requestPasswordReset(mail); setMessage("Se esse e-mail tiver uma conta, enviamos um link de recuperação. Confira sua caixa de entrada (e o spam)."); }
      catch (e) { fail(translate(errMsg(e))); }
      finally { setBusy(false); }
      return;
    }

    if (!mail || !password) return fail("Preencha e-mail e senha.");
    if (password.length < 6) return fail("A senha precisa ter pelo menos 6 caracteres.");
    if (mode === "signup") {
      const u = username.trim();
      if (!u) return fail("Escolha um nome de usuário.");
      if (!/^[a-zA-Z0-9_.]{3,24}$/.test(u)) return fail("Nome de usuário deve ter 3–24 caracteres (letras, números, _ ou .).");
      if (!age) return fail("Informe sua idade.");
    }

    setBusy(true);
    try {
      if (mode === "login") { await signIn(mail, password); toProfiles(); }
      else {
        await signUp(mail, password, { age: Number(age), username: username.trim(), phone: phone.trim() || null });
        setMode("login");
        setMessage("Conta criada! Verifique seu e-mail para confirmar antes de entrar.");
      }
    } catch (e) { fail(translate(errMsg(e))); }
    finally { setBusy(false); }
  }

  async function guestNew() {
    setGuestBusy(true);
    try { await signInAsGuest(); toProfiles(); }
    catch (e) {
      setGuestOpen(false);
      const m = errMsg(e);
      fail(m.includes("Anonymous") ? "Login de convidado está desativado neste servidor no momento." : translate(m));
    } finally { setGuestBusy(false); }
  }

  async function guestRedeem() {
    const code = guestCode.trim().toUpperCase();
    setGuestError("");
    if (!code) return setGuestError("Digite o código de convidado.");
    setGuestBusy(true);
    try { await redeemGuestRecoveryCode(code); toProfiles(); }
    catch (e) { setGuestError(errMsg(e)); }
    finally { setGuestBusy(false); }
  }

  const st = strength(password);
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") void submit(); };

  return (
    <>
      <div className="auth-screen">
        <AuthBackground />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="auth-brand"><div className="logo-mark">A</div><span>ALXmovies</span></div>

          <div className="auth-box">
            <h1>{copy.title}</h1>
            <p className="auth-subtitle">{copy.subtitle}</p>
            <p className="auth-error" style={{ display: error ? "block" : "none" }}>{error}</p>
            <p className="auth-message" style={{ display: message ? "block" : "none" }}>{message}</p>

            <div className="auth-field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" placeholder="voce@email.com" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => mode === "forgot" && onEnter(e)} />
            </div>

            {mode === "signup" && (
              <div className="auth-row-2" style={{ display: "flex" }}>
                <div className="auth-field">
                  <label htmlFor="username">Nome de usuário</label>
                  <input id="username" type="text" placeholder="ex: joao123" maxLength={24} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className="auth-field">
                  <label htmlFor="phone">Telefone</label>
                  <input id="phone" type="tel" placeholder="(11) 91234-5678" maxLength={20} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
            )}

            {mode !== "forgot" && (
              <div className="auth-field" style={{ display: "flex" }}>
                <label htmlFor="password">Senha</label>
                <div className="password-wrap">
                  <input id="password" type={showPw ? "text" : "password"} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} />
                  <button type="button" className="password-toggle" aria-label="Mostrar senha" onClick={() => setShowPw((v) => !v)}>{showPw ? "🙈" : "👁"}</button>
                </div>
                {mode === "signup" && (
                  <div className="password-strength" style={{ display: "block" }}>
                    <div className="password-strength-bar" style={{ width: `${st.pct}%`, background: st.color }} />
                  </div>
                )}
              </div>
            )}

            {mode === "signup" && (
              <div className="auth-field" style={{ display: "flex" }}>
                <label htmlFor="age">Idade</label>
                <input id="age" type="number" min={1} max={120} placeholder="Sua idade" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
            )}

            {mode === "login" && <p className="auth-forgot"><a onClick={() => changeMode("forgot")}>Esqueceu a senha?</a></p>}

            <BusyButton className="auth-submit" loading={busy} onClick={() => void submit()}>
              {busy ? (mode === "login" ? "Entrando..." : mode === "signup" ? "Cadastrando..." : "Enviando...") : copy.submit}
            </BusyButton>

            {mode === "login" && (
              <>
                <div className="auth-divider" style={{ display: "flex" }}><span>ou</span></div>
                <button type="button" className="auth-submit auth-guest-btn" style={{ display: "block" }}
                  onClick={() => { setError(""); setMessage(""); setGuestStep("choice"); setGuestCode(""); setGuestError(""); setGuestOpen(true); }}>
                  🎭 Entrar como convidado
                </button>
                <p className="auth-guest-hint" style={{ display: "block" }}>Acesso rápido sem cadastro, válido por 24 horas.</p>
              </>
            )}

            <p className="auth-switch">
              <span>{copy.switchText}</span>{" "}
              <a onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{copy.switchLink}</a>
            </p>
            {mode === "signup" && (
              <p className="auth-terms" style={{ display: "block" }}>
                Ao criar uma conta, você concorda com o uso do serviço para fins pessoais e confirma que os dados informados são verdadeiros.
              </p>
            )}
          </div>
        </div>
      </div>

      {guestOpen && (
        <div className="guest-code-overlay" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setGuestOpen(false)}>
          <div className="guest-code-box guest-confirm-box">
            <button className="guest-code-close" aria-label="Fechar" onClick={() => setGuestOpen(false)}>✕</button>
            {guestStep === "choice" ? (
              <div>
                <div className="guest-code-icon">🎭</div>
                <h2>Você já tem uma conta de convidado?</h2>
                <p>Se você já entrou como convidado antes e guardou um código de acesso, use-o pra continuar de onde parou. Senão, é só criar uma sessão nova.</p>
                <div className="guest-confirm-actions">
                  <BusyButton className="account-btn secondary" loading={guestBusy} onClick={() => void guestNew()}>{guestBusy ? "Entrando..." : "Não, criar nova"}</BusyButton>
                  <button className="account-btn" onClick={() => setGuestStep("code")}>Sim, tenho código</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="guest-code-icon">🔑</div>
                <h2>Digite seu código</h2>
                <p>O código que você guardou quando gerou o acesso de convidado.</p>
                <input type="text" placeholder="XXXXX-XXXXX" maxLength={11} autoFocus value={guestCode}
                  onChange={(e) => setGuestCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void guestRedeem()}
                  style={{ textTransform: "uppercase", textAlign: "center", letterSpacing: 2, fontWeight: 700, width: "100%", padding: 12, borderRadius: 8, border: "1px solid #444", background: "#101014", color: "#f2f2f2", fontSize: "1rem" }} />
                {guestError && <p className="auth-error" style={{ display: "block" }}>{guestError}</p>}
                <div className="guest-confirm-actions">
                  <button className="account-btn secondary" onClick={() => { setGuestStep("choice"); setGuestError(""); }}>Voltar</button>
                  <BusyButton className="account-btn" loading={guestBusy} onClick={() => void guestRedeem()}>{guestBusy ? "Verificando..." : "Entrar"}</BusyButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
