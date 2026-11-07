import { supabase } from "@/lib/supabase";

export type StaffRole = "dono" | "admin" | null;
export interface StaffStatus { role: StaffRole; can_publish?: boolean; since?: string; via?: string }

export async function getStaffStatus(): Promise<StaffStatus> {
  const { data, error } = await supabase.rpc("my_staff_status");
  if (error) return { role: null };
  return (data as StaffStatus | null) ?? { role: null };
}

// ---------------- teste para virar admin ----------------
export interface QuizQuestion { q: string; options: string[] }
export interface QuizReply {
  state: "login" | "already" | "ready" | "limit" | "cooldown" | "running" | "done" | "expired" | "invalid" | "error";
  total?: number; pass?: number; minutes?: number; left?: number; maxPerDay?: number;
  retryAt?: string; attemptId?: string; expiresAt?: string; questions?: QuizQuestion[];
  score?: number; passed?: boolean;
}

/** Fala com a função do servidor (sorteia as perguntas e corrige; as respostas certas nunca chegam aqui). */
export async function quiz(action: "status" | "start" | "submit", body: Record<string, unknown> = {}): Promise<QuizReply> {
  const { data, error } = await supabase.functions.invoke("admin-quiz", { body: { action, ...body } });
  if (error || !data) return { state: "error" };
  return data as QuizReply;
}

// ---------------- sugestões de aviso ----------------
export interface Proposal { id: number; title: string; body: string; url: string | null; status: "pending" | "approved" | "rejected"; created_at: string }
export interface PendingProposal { id: number; author: string; author_name: string; title: string; body: string; url: string | null; created_at: string }
export interface StaffRow { user_id: string; username: string; can_publish: boolean; granted_via: string; since: string }

const msg = (e: { message?: string }) => new Error(e.message?.replace(/^.*?:\s*/, "") || "Não foi possível concluir.");

export async function proposeAnnouncement(title: string, body: string, url: string): Promise<void> {
  const { error } = await supabase.rpc("propose_announcement", { p_title: title, p_body: body, p_url: url.trim() || null });
  if (error) throw msg(error);
}
export async function myProposals(): Promise<Proposal[]> {
  const { data, error } = await supabase.from("announcement_proposals").select("id,title,body,url,status,created_at").order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []) as Proposal[];
}
export async function listProposals(): Promise<PendingProposal[]> {
  const { data, error } = await supabase.rpc("list_proposals");
  if (error) throw error;
  return (data ?? []) as PendingProposal[];
}
export async function reviewProposal(id: number, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc("review_proposal", { p_id: id, p_approve: approve });
  if (error) throw msg(error);
}
export async function staffList(): Promise<StaffRow[]> {
  const { data, error } = await supabase.rpc("staff_list");
  if (error) throw error;
  return (data ?? []) as StaffRow[];
}
export async function setStaffPublish(user: string, can: boolean): Promise<void> {
  const { error } = await supabase.rpc("staff_set_publish", { p_user: user, p_can: can });
  if (error) throw msg(error);
}
export async function revokeStaff(user: string): Promise<void> {
  const { error } = await supabase.rpc("staff_revoke", { p_user: user });
  if (error) throw msg(error);
}

// ---------------- selo de admin verificado ----------------
export interface StaffDirectory { users: string[]; profiles: string[] }

/** Quem tem o selo ✔ (lista pública). Se o SQL ainda não foi rodado, volta vazio e ninguém aparece com selo. */
export async function fetchStaffDirectory(): Promise<StaffDirectory> {
  const { data, error } = await supabase.rpc("staff_directory");
  if (error || !data) return { users: [], profiles: [] };
  const d = data as Partial<StaffDirectory>;
  return { users: d.users ?? [], profiles: d.profiles ?? [] };
}
