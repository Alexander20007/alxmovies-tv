import { supabase } from "@/lib/supabase";

export type PlanId = "free" | "apoiador" | "premium" | "familia";

export interface MyPlan {
  plan_id: PlanId;
  name: string;
  show_ads: boolean;
  price_brl: number | null;
  limit: number;
  used: number;
  remaining: number;
  expires_at: string | null;
  bonus_today: number;
  staff?: boolean;
}

export interface PlanInfo {
  id: PlanId; name: string; downloads_per_month: number; show_ads: boolean; rank: number; price_brl: number | null; perks: string[];
}

export async function getMyPlan(): Promise<MyPlan | null> {
  const { data, error } = await supabase.rpc("get_my_plan");
  if (error) throw error;
  return (data as MyPlan | null) ?? null;
}

export async function listPlans(): Promise<PlanInfo[]> {
  const { data, error } = await supabase.from("plans").select("*").order("rank");
  if (error) throw error;
  return (data ?? []) as PlanInfo[];
}

/** Gasta 1 download. ok=false quando o limite do mês acabou. */
export async function consumeDownload(): Promise<{ ok: boolean; remaining?: number }> {
  const { data, error } = await supabase.rpc("use_download");
  if (error) throw error;
  return data as { ok: boolean; remaining?: number };
}

/** +1 download por anúncio premiado assistido (máx. 3 por dia). */
export async function grantAdBonus(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("grant_ad_bonus");
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}

