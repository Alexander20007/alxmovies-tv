import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ProfileFormModal, type ProfileFormValues } from "@/components/ProfileFormModal";
import { useProfile } from "@/context/ProfileContext";
import { formatAllowedWindow, getTrustedNow, getTrustedTimezoneOffsetMinutes, isWithinAllowedTime } from "@/lib/parentalTime";
import { createProfile, MAX_PROFILES, updateProfile, uploadAvatar } from "@/services/profiles";
import type { Profile } from "@/types";
import { useBackClose } from "@/hooks/useBackClose";

export default function Profiles() {
  const { profiles, loading, selectProfile } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = useLocation().state as { from?: string; timelocked?: boolean } | null;
  const from = state?.from ?? "/home";

  const [notice, setNotice] = useState<string | null>(
    state?.timelocked ? "⏰ O horário permitido desse perfil acabou — escolha outro perfil ou volte dentro do horário liberado." : null
  );
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  useBackClose(!!pinFor, () => setPinFor(null));
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const enter = (p: Profile) => { selectProfile(p.id); navigate(from, { replace: true }); };

  async function choose(p: Profile) {
    const [now, offset] = await Promise.all([getTrustedNow(), getTrustedTimezoneOffsetMinutes()]);
    if (!isWithinAllowedTime(p, now, offset)) {
      setNotice(`⏰ O perfil "${p.name}" só pode ser usado das ${formatAllowedWindow(p)}. Tente de novo dentro desse horário.`);
      return;
    }
    setNotice(null);
    if (p.pin) { setPinFor(p); setPinValue(""); setPinError(false); }
    else enter(p);
  }

  async function create(v: ProfileFormValues) {
    setBusy(true); setFormError(null);
    try {
      const created = await createProfile({
        name: v.name, age: v.age, isKids: v.isKids, isAdmin: v.isAdmin, maturityRating: v.maturityRating,
        birthday: v.birthday, pin: v.pin, colorTheme: v.color,
      });
      if (v.avatarFile) {
        const url = await uploadAvatar(created.id, v.avatarFile);
        await updateProfile(created.id, { avatar: url });
      }
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      setCreating(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar perfil");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Carregando…</p>;

  return (
    <div className="profiles-screen">
      <div className="profiles-brand">ALX<span>movies</span></div>
      <h1>Quem está assistindo?</h1>
      <p className="profiles-subtitle" style={notice ? { color: "#ff8b8f" } : undefined}>{notice ?? "Escolha um perfil para continuar"}</p>

      <div className="profiles-grid">
        {profiles.map((p, i) => (
          <div key={p.id} className={`profile-item${p.is_kids ? " kids" : ""}`} style={{ animationDelay: `${i * 60}ms` }} onClick={() => void choose(p)}>
            <ProfileAvatar profile={p} badge={p.is_kids ? "KIDS" : undefined} />
            <div className="profile-name">{p.is_admin ? "👑 " : ""}{p.name}</div>
          </div>
        ))}
        {profiles.length < MAX_PROFILES && (
          <div className="profile-item add-profile" onClick={() => { setFormError(null); setCreating(true); }}>
            <div className="profile-avatar">+</div>
            <div className="profile-name">Adicionar perfil</div>
          </div>
        )}
      </div>
      {profiles.length > 0 && <Link className="manage-link" to="/manage-profiles">✎ Gerenciar perfis</Link>}

      {creating && <ProfileFormModal busy={busy} error={formError} onSubmit={create} onCancel={() => setCreating(false)} />}

      {pinFor && (
        <div className="modal-overlay" style={{ display: "flex" }}>
          <div className="modal-box">
            <h2>Perfil protegido</h2>
            <input type="password" inputMode="numeric" maxLength={4} placeholder="Digite o PIN" autoFocus value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && (pinValue === pinFor.pin ? enter(pinFor) : setPinError(true))} />
            {pinError && <p className="error-text" style={{ display: "block" }}>PIN incorreto.</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPinFor(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => (pinValue === pinFor.pin ? enter(pinFor) : setPinError(true))}>Entrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
