import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ProfileFormModal, type ProfileFormValues } from "@/components/ProfileFormModal";
import { useProfile } from "@/context/ProfileContext";
import { deleteProfile, updateProfile, uploadAvatar } from "@/services/profiles";
import type { Profile } from "@/types";

export default function ManageProfiles() {
  const { profiles, loading, activeProfile, clearProfile } = useProfile();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(v: ProfileFormValues) {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      const avatar = v.avatarFile ? await uploadAvatar(editing.id, v.avatarFile) : editing.avatar ?? null;
      await updateProfile(editing.id, {
        name: v.name, age: v.age, is_kids: v.isKids, maturity_rating: v.maturityRating, is_admin: v.isAdmin,
        favorite_genres: v.favoriteGenres, time_restriction_enabled: v.timeEnabled,
        allowed_start_time: v.timeEnabled ? v.start : null, allowed_end_time: v.timeEnabled ? v.end : null,
        birthday: v.birthday, pin: v.pin, avatar, color_theme: v.color,
      });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      setEditing(null);
    } catch (e) {
      setError("Erro ao salvar: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || !window.confirm(`Excluir o perfil "${editing.name}"? Histórico e lista dele serão perdidos.`)) return;
    setBusy(true); setError(null);
    try {
      await deleteProfile(editing.id);
      if (activeProfile?.id === editing.id) clearProfile();
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Carregando…</p>;

  return (
    <div className="profiles-screen">
      <Link className="manage-back" to="/profiles">← Voltar</Link>
      <div className="profiles-brand">ALX<span>movies</span></div>
      <h1>Gerenciar perfis</h1>
      <p className="profiles-subtitle">Toque em um perfil para editar</p>
      <div className="profiles-grid">
        {profiles.map((p) => (
          <div key={p.id} className="profile-item" onClick={() => { setError(null); setEditing(p); }}>
            <ProfileAvatar profile={p} badge="✎" />
            <div className="profile-name">{p.is_admin ? "👑 " : ""}{p.name}{p.is_kids ? " (infantil)" : ""}</div>
          </div>
        ))}
      </div>

      {editing && (
        <ProfileFormModal initial={editing} busy={busy} error={error} onSubmit={save} onCancel={() => setEditing(null)} onDelete={remove} />
      )}
    </div>
  );
}
