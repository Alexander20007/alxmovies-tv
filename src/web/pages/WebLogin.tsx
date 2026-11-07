import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { requestPasswordReset } from "@/services/account";
import { isReservedName, RESERVED_MSG } from "@/lib/reservedNames";
import { SitePage, safeNext } from "../SitePage";

type Mode = "login" | "signup" | "forgot";
const ERRORS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "User already registered": "Já existe uma conta com esse e-mail.",
  "Email not confirmed": "Confirme seu e-mail antes de entrar.",
};
const errMsg = (e: unknown) => { const m = e instanceof Error ? e.message : "Erro inesperado"; return ERRORS[m] ?? m; };

/** Entrar / criar conta no site. É a MESMA conta do app. */
export default function WebLogin() {
  const { user, loading, signIn, signUp } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("novo") ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  if (!loading && user && !user.is_anonymous) return <Navigate to={next} replace />;

  const change = (m: Mode) => { setMode(m); setError(""); setInfo(""); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    const mail = email.trim();
    if (!mail) return setError("Digite seu e-mail.");
    if (mode !== "forgot") {
      if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
      if (mode === "signup") {
        if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username.trim())) return setError("Nome de usuário: 3 a 24 caracteres (letras, números, _ ou .).");
        if (isReservedName(username)) return setError(RESERVED_MSG);
        if (!age) return setError("Informe sua idade.");
      }
    }
    setBusy(true);
    try {
      if (mode === "login") await signIn(mail, password);
      else if (mode === "signup") {
        await signUp(mail, password, { age: Number(age), username: username.trim(), phone: null });
        change("login"); setInfo("Conta criada! Confirme seu e-mail e depois entre.");
      } else {
        await requestPasswordReset(mail);
        setInfo("Se esse e-mail tiver conta, enviamos um link para criar uma nova senha. Olhe também o spam.");
      }
    } catch (err) { setError(errMsg(err)); }
    finally { setBusy(false); }
  }

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha";
  return (
    <SitePage title={title} sub="A mesma conta vale no site e no app.">
      <form className="wb-form" onSubmit={(e) => void submit(e)} noValidate>
        {error && <p className="wb-form-err" role="alert">{error}</p>}
        {info && <p className="wb-form-ok">{info}</p>}
        <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></label>
        {mode === "signup" && (
          <>
            <label>Nome de usuário<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu_nome" /></label>
            <label>Idade<input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="18" /></label>
          </>
        )}
        {mode !== "forgot" && (
          <label>Senha<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" /></label>
        )}
        <button className="wb-btn primary" type="submit" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : mode === "signup" ? "Cadastrar" : "Enviar link"}</button>
        <div className="wb-form-links">
          {mode !== "login" && <button type="button" onClick={() => change("login")}>Já tenho conta</button>}
          {mode !== "signup" && <button type="button" onClick={() => change("signup")}>Criar conta</button>}
          {mode === "login" && <button type="button" onClick={() => change("forgot")}>Esqueci a senha</button>}
        </div>
      </form>
    </SitePage>
  );
}
