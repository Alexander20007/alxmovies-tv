import { supabase } from "@/lib/supabase";

export interface Announcement {
  id: number; title: string; body: string; url: string | null; created_at: string; expires_at: string;
  /** "Admin João" (quem publicou); vazio nos avisos antigos */
  author_label?: string | null;
}

/** Avisos ainda válidos (qualquer pessoa vê, até convidado). */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements").select("id,title,body,url,created_at,expires_at,author_label")
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

/** true para o dono do app e para admins com "publicar sozinho" liberado. */
export async function isAppAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_publish_announcements");
  if (error) return false;
  return data === true;
}

export async function sendAnnouncement(o: { title: string; body: string; url?: string; days: number; push: boolean }): Promise<void> {
  const { error } = await supabase.rpc("send_announcement", {
    p_title: o.title, p_body: o.body, p_url: o.url?.trim() || null, p_days: o.days, p_push: o.push,
  });
  if (error) throw new Error(error.message.includes("sem permissão") ? "Esta conta não tem permissão para enviar avisos." : error.message);
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const { error } = await supabase.rpc("delete_announcement", { p_id: id });
  if (error) throw error;
}
