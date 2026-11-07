import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import { listPlans, type PlanInfo } from "@/services/plans";
import { SitePage } from "../SitePage";

const price = (p: PlanInfo) => p.id === "free" ? "Grátis" : p.price_brl != null ? `R$ ${p.price_brl.toFixed(2).replace(".", ",")}/mês` : "Preço em breve";

export default function WebPlans() {
  const { user } = useAuth();
  const { plan } = usePlan();
  const q = useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: 10 * 60_000 });
  const logged = !!user && !user.is_anonymous;
  return (
    <SitePage title="Planos" sub="Mais downloads e sem anúncios. A contratação chega em breve; por enquanto você pode ganhar um plano na Roda da Sorte.">
      {q.isError && <p className="wb-form-err">Não foi possível carregar os planos agora.</p>}
      <div className="wb-plans">
        {(q.data ?? []).map((p) => {
          const cur = logged && plan?.plan_id === p.id;
          return (
            <article key={p.id} className={`wb-card wb-plan${cur ? " cur" : ""}`}>
              <div className="wb-plan-top"><h2>{p.name}</h2><span>{price(p)}</span></div>
              <ul>{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
              {cur && <em>Seu plano atual</em>}
            </article>
          );
        })}
      </div>
      <div className="wb-row center">
        <Link className="wb-btn primary" to="/roda">🎡 Tentar a Roda da Sorte</Link>
        {!logged && <Link className="wb-btn" to="/entrar?next=/planos">Entrar</Link>}
      </div>
    </SitePage>
  );
}
