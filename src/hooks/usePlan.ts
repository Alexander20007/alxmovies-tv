import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { getMyPlan, type MyPlan } from "@/services/plans";

export const PLAN_KEY = ["my-plan"];

/** Plano da conta (vale para todos os perfis). Enquanto carrega, assume Grátis só para anúncios NÃO piscarem: ads só depois de saber. */
export function usePlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...PLAN_KEY, user?.id], queryFn: getMyPlan, enabled: !!user, staleTime: 30_000, refetchOnWindowFocus: true });
  const plan: MyPlan | null = q.data ?? null;
  return {
    plan,
    loading: q.isLoading,
    /** true só depois que o servidor confirmou que o plano mostra anúncios */
    showAds: !!plan?.show_ads,
    refresh: () => qc.invalidateQueries({ queryKey: PLAN_KEY }),
  };
}
