import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { initAds, loadAdsForGuest, setBanner } from "@/lib/ads";
import { useAdsEnabled } from "@/hooks/useAdsEnabled";
import { isNative } from "@/lib/native";

/** Site: scripts de anúncio só para convidado. App: liga o Start.io quando o plano da conta é o Grátis. */
export function AdsLoader() {
  const { user } = useAuth();
  const guest = !!user?.is_anonymous;
  const adsOn = useAdsEnabled();
  useEffect(() => { if (guest) loadAdsForGuest(); }, [guest]);
  useEffect(() => { if (adsOn) void initAds(); }, [adsOn]);
  return null;
}

/** Banner do rodapé (app, plano Grátis). Coloque só nas telas escolhidas; some sozinho ao sair da tela. */
export function NativeBanner() {
  const on = useAdsEnabled();
  useEffect(() => {
    if (!on) return;
    void setBanner(true);
    return () => { void setBanner(false); };
  }, [on]);
  return null;
}

/** Bloco do AdSense (só convidado). Troque o data-ad-slot pelo ID real do seu painel do AdSense. */
export function AdBlock() {
  const { user } = useAuth();
  const guest = !!user?.is_anonymous;
  useEffect(() => {
    if (!guest) return;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); }
    catch (err) { console.warn("AdSense ainda não carregou:", err); }
  }, [guest]);
  if (!guest || isNative) return null;
  return (
    <div className="ad-block">
      <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client="ca-pub-7077223794117969" data-ad-slot="0000000000"
        data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
