import { CONFIG } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";

export async function reauthenticate(password: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Usuário não autenticado");
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (error) throw error;
}

export async function updateAccountInfo(metadata: Record<string, unknown>) {
  const { error } = await supabase.auth.updateUser({ data: metadata });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function upgradeGuestAccount(v: { email: string; password: string; username: string; phone?: string; age?: number | null }) {
  const { error } = await supabase.auth.updateUser({
    email: v.email,
    password: v.password,
    data: { username: v.username, phone: v.phone || null, age: v.age ?? null },
  });
  if (error) throw error;
  storage.clearGuest();
}

export async function generateGuestRecoveryCode(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nenhuma sessão de convidado ativa.");
  const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/guest-generate-code`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Não foi possível gerar o código.");
  return data.code;
}

export async function redeemGuestRecoveryCode(code: string) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/guest-redeem-code`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Código inválido.");
  const { error } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (error) throw error;
  storage.setGuestStartedAt(new Date(data.guestStartedAt).getTime());
  storage.clearProfileId(); // o perfil pode ter sido escolhido em outro aparelho
}

export interface Subscription { status?: string; plan?: string | null; current_period_end?: string | null }
export async function getSubscription(): Promise<Subscription | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}

export async function getProfileActivitySummary(profileId: string) {
  const count = (q: any) => q.then((r: any) => r.count || 0);
  const [watched, inProgress, favChannels, recent] = await Promise.all([
    count(supabase.from("watch_history").select("id", { count: "exact", head: true }).eq("profile_id", profileId).gte("progress", 95)),
    count(supabase.from("watch_history").select("id", { count: "exact", head: true }).eq("profile_id", profileId).lt("progress", 95)),
    count(supabase.from("channel_favorites").select("id", { count: "exact", head: true }).eq("profile_id", profileId)),
    supabase.from("watch_history").select("title, media_type, media_id, watched_at, progress").eq("profile_id", profileId).order("watched_at", { ascending: false }).limit(5),
  ]);
  return {
    watchedCount: watched as number, inProgressCount: inProgress as number, favoriteChannelsCount: favChannels as number,
    recentlyWatched: (recent.data ?? []) as { title: string | null; progress: number | null; media_id: number; media_type: string }[],
  };
}
