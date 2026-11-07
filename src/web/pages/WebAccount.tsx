import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import { SitePage } from "../SitePage";
import { DownloadButton } from "../Chrome";

export default function WebAccount() {
  const { user, loading, signOut } = useAuth();
  const { plan, loading: pl } = usePlan();
  const [busy, setBusy] = useState(false);

  if (loading) return <SitePage title="Minha conta"><p className="wb-dim">Carregando…</p></SitePage>;
  if (!user || user.is_anonymous) return <Navigate to="/entrar?next=/conta" replace />;

  const meta = (user.user_metadata ?? {}) as { username?: string };
  const pct = plan && plan.limit > 0 ? Math.min(100, Math.round((plan.used / plan.limit) * 100)) : 0;
  const until = plan?.expires_at ? new Date(plan.expires_at).toLocaleDateString("pt-BR") : null;

  return (
    <SitePage title="Minha conta" sub={meta.username ? `@${meta.username} · ${user.email}` : user.email ?? ""}>
      <section className="wb-card wb-acc">
        <small>Seu plano</small>
        {pl || !plan ? <p className="wb-dim">Carregando…</p> : (
          <>
            <h2>{plan.name}{until ? <span> · até {until}</span> : null}</h2>
            <div className="wb-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
            <p>{plan.used} de {plan.limit} downloads usados neste mês · restam <b>{plan.remaining}</b></p>
            <p className="wb-dim">{plan.show_ads ? "O plano Grátis mostra anúncios no app." : "Sem anúncios no app."}</p>
          </>
        )}
        <div className="wb-row">
          <Link className="wb-btn primary" to="/roda">Girar a roda</Link>
          <Link className="wb-btn" to="/planos">Ver planos</Link>
        </div>
      </section>
      <section className="wb-card wb-acc">
        <small>Equipe</small>
        {plan?.staff
          ? <><p><span className="wb-badge">Admin</span> Você faz parte da equipe e tem o Premium incluso.</p><div className="wb-row"><Link className="wb-btn primary" to="/admin">Painel de admin</Link></div></>
          : <><p className="wb-dim">Quer ajudar o ALXmovies? Faça um teste rápido e vire admin: você ganha Premium grátis e um selo.</p><div className="wb-row"><Link className="wb-btn primary" to="/admin/teste">Fazer o teste</Link></div></>}
      </section>
      <section className="wb-card wb-acc">
        <small>App Android</small>
        <p className="wb-dim">Entre no app com este mesmo e-mail e o plano já aparece lá.</p>
        <DownloadButton />
      </section>
      <button type="button" className="wb-btn wb-out" disabled={busy} onClick={() => { setBusy(true); void signOut().finally(() => setBusy(false)); }}>Sair da conta</button>
    </SitePage>
  );
}
