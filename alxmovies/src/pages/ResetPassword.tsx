import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthBackground } from "@/components/AuthBackground";
import { openedViaRecoveryLink, supabase } from "@/lib/supabase";
import { updatePassword } from "@/services/account";
import { BusyButton } from "@/components/Spinner";

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return { pct: [0, 25, 55, 80, 100][score], color: ["#ff2d55", "#ff2d55", "#e0a11c", "#e0a11c", "#2e9e4a"][score] };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // O link do e-mail dispara PASSWORD_RECOVERY; se o evento já passou, confere sessão + marca do link.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY") setState("ready");
    });
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setState((cur) => {
        if (cur !== "checking") return cur;
        if (openedViaRecoveryLink && data.session) return "ready";
        return data.session ? "ready" : "invalid";
      });
    }, 2500);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const st = strength(pw);

  async function submit() {
    setError("");
    if (pw.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    if (pw !== pw2) return setError("As senhas não coincidem.");
    setBusy(true);
    try {
      await updatePassword(pw);
      await supabase.auth.signOut();
      navigate("/login?reset=success", { replace: true });
    } catch (err) {
      setError("Não foi possível salvar: " + (err instanceof Error ? err.message : "tente de novo"));
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <AuthBackground />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="auth-brand"><div className="logo-mark">A</div><span>ALXmovies</span></div>
        <div className="auth-box">
          <h1>Criar nova senha</h1>
          <p className="auth-subtitle">
            {state === "checking" ? "Confirmando o link de recuperação..." : state === "ready" ? "Digite a nova senha para a sua conta." : ""}
          </p>
          <p className="auth-error" style={{ display: error || state === "invalid" ? "block" : "none" }}>
            {state === "invalid" ? "Este link de recuperação é inválido ou já expirou. Solicite um novo na tela de login." : error}
          </p>

          {state === "ready" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="auth-field">
                <label htmlFor="rp-password">Nova senha</label>
                <div className="password-wrap">
                  <input id="rp-password" type={show ? "text" : "password"} placeholder="Mínimo 6 caracteres" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
                  <button type="button" className="password-toggle" aria-label="Mostrar senha" onClick={() => setShow((v) => !v)}>{show ? "🙈" : "👁"}</button>
                </div>
                <div className="password-strength"><div className="password-strength-bar" style={{ width: `${st.pct}%`, background: st.color }} /></div>
              </div>
              <div className="auth-field">
                <label htmlFor="rp-password-2">Confirmar nova senha</label>
                <input id="rp-password-2" type="password" placeholder="Repita a nova senha" autoComplete="new-password" value={pw2}
                  onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
              </div>
              <BusyButton className="auth-submit" loading={busy} onClick={() => void submit()}>{busy ? "Salvando..." : "Salvar nova senha"}</BusyButton>
            </div>
          )}

          {state === "invalid" && <p className="auth-switch" style={{ display: "block" }}><Link to="/login">← Voltar para o login</Link></p>}
        </div>
      </div>
    </div>
  );
}
