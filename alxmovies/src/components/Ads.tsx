import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { loadAdsForGuest } from "@/lib/ads";
import { isNative } from "@/lib/native";

/** Carrega os scripts de anúncio somente em sessão de convidado. */
export function AdsLoader() {
  const { user } = useAuth();
  const guest = !!user?.is_anonymous;
  useEffect(() => { if (guest) loadAdsForGuest(); }, [guest]);
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
