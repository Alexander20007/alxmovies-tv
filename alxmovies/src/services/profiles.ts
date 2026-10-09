import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

export const MAX_PROFILES = 5;

export async function fetchProfiles(userId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw error;
  return data as Profile[];
}

async function demoteAllAdmins(userId: string) {
  const { error } = await supabase.from("profiles").update({ is_admin: false }).eq("user_id", userId).eq("is_admin", true);
  if (error) throw error;
}

export interface NewProfile {
  name: string;
  avatar?: string | null;
  isKids?: boolean;
  maturityRating?: string;
  pin?: string | null;
  age?: number | null;
  colorTheme?: string | null;
  isAdmin?: boolean;
  birthday?: string | null;
}

export async function createProfile(p: NewProfile): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  // O primeiro perfil é sempre o responsável; perfil infantil nunca é.
  const existing = await fetchProfiles(user.id);
  const isAdmin = p.isKids ? false : !!p.isAdmin || existing.length === 0;
  // Só existe UM responsável por conta.
  if (isAdmin && existing.some((x) => x.is_admin)) await demoteAllAdmins(user.id);

  const { data, error } = await supabase.from("profiles").insert({
    user_id: user.id,
    name: p.name,
    avatar: p.avatar ?? null,
    is_kids: !!p.isKids,
    maturity_rating: p.maturityRating ?? "16",
    pin: p.pin ?? null,
    age: p.age ?? null,
    color_theme: p.colorTheme ?? null,
    is_admin: isAdmin,
    birthday: p.birthday ?? null,
  }).select().single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(profileId: string, updates: Partial<Profile>): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  if (updates.is_admin === false) {
    const all = await fetchProfiles(user.id);
    if (!all.some((p) => p.id !== profileId && p.is_admin)) {
      throw new Error("Precisa deixar pelo menos um perfil como responsável.");
    }
  }
  if (updates.is_admin === true) await demoteAllAdmins(user.id);

  const { data, error } = await supabase.from("profiles").update(updates).eq("id", profileId).select().single();
  if (error) throw error;
  return data as Profile;
}

export async function deleteProfile(profileId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");
  const all = await fetchProfiles(user.id);
  const target = all.find((p) => p.id === profileId);
  if (target?.is_admin && !all.some((p) => p.id !== profileId && p.is_admin)) {
    throw new Error("Esse é o único perfil responsável da conta — marque outro como responsável antes de apagar este.");
  }
  const { error } = await supabase.from("profiles").delete().eq("id", profileId);
  if (error) throw error;
}

export async function uploadAvatar(profileId: string, file: File) {
  const ext = file.name.split(".").pop();
  const path = `${profileId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
