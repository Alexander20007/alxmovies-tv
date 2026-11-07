import { isNative } from "@/lib/native";
import { useProfile } from "@/context/ProfileContext";
import { usePlan } from "@/hooks/usePlan";

/** Anúncios do app: só no Android, só plano Grátis (confirmado pelo servidor) e nunca em perfil Kids. */
export function useAdsEnabled(): boolean {
  const { showAds } = usePlan();
  const { activeProfile } = useProfile();
  return isNative && showAds && !activeProfile?.is_kids;
}
