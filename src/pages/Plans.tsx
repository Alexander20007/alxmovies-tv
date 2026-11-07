import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { NativeBanner } from "@/components/Ads";
import { usePlan } from "@/hooks/usePlan";
import { openExternal } from "@/lib/native";
import { CONFIG } from "@/lib/config";
import { listPlans, type PlanInfo } from "@/services/plans";

const SITE = "https://alxmovies.netlify.app";

function price(p: PlanInfo) {
  if (p.id === "free") return "Grátis";
  return p.price_brl != null ? `R$ ${p.price_brl.toFixed(2).replace(".", ",")}/mês` : "Preço em breve";
}

/** No app só se VÊ o plano. Contratar, ganhar plano na roda e gerenciar a conta é tudo no site. */
export default function Plans() {
  const navigate = useNavigate();
  const { plan } = usePlan();
  const plans = useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: 10 * 60_000 });

  const left = plan ? `${plan.remaining} de ${plan.limit} downloads restantes neste mês` : "";
  const until = plan?.expires_at ? ` · até ${new Date(plan.expires_at).toLocaleDateString("pt-BR")}` : "";

  return (
    <main className="plans-page">
      <header className="plans-head">
        <button type="button" className="ig-icon-btn" aria-label="Voltar" onClick={() => navigate(-1)}><Icon name="arrowLeft" /></button>
        <h1>Planos</h1>
      </header>

      {plan && (
        <section className="plans-now">
          <small>Seu plano</small>
          <b>{plan.name}{until}</b>
          <span>{left}</span>
          {plan.staff && <span>Premium incluso por ser admin</span>}
        </section>
      )}

      <div className="plans-list">
        {(plans.data ?? []).map((p) => (
          <article key={p.id} className={`plan-card${plan?.plan_id === p.id ? " current" : ""}`}>
            <div className="plan-top"><h2>{p.name}</h2><span className="plan-price">{price(p)}</span></div>
            <ul>{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
            {plan?.plan_id === p.id && <em className="plan-tag">Plano atual</em>}
          </article>
        ))}
      </div>

      <p className="plans-note">Os planos e a Roda da Sorte ficam no site. Entre lá com o mesmo e-mail do app e o plano aparece aqui sozinho.</p>
      <div className="plans-actions">
        <button type="button" className="btn btn-primary" onClick={() => void openExternal(`${SITE}/roda`)}>🎡 Girar a roda no site</button>
        <button type="button" className="btn btn-secondary" onClick={() => void openExternal(`${SITE}/planos`)}>Ver planos no site</button>
      </div>
      {plan?.staff && <p className="plans-note" style={{ fontSize: "0.76rem", opacity: 0.6 }}>Admin: anúncios em modo {CONFIG.ADS.TEST_MODE ? "TESTE" : "REAL"} · regra: {CONFIG.ADS.STRATEGY === "alternate" ? "revezar Start.io e Unity" : CONFIG.ADS.PRIMARY === "unity" ? "Unity, com Start.io de reserva" : "Start.io, com Unity de reserva"}.</p>}
      <NativeBanner />
    </main>
  );
}
