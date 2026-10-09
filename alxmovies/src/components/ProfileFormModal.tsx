import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RATING_OPTIONS } from "@/lib/contentFilter";
import { tmdb } from "@/services/tmdb";
import type { Profile } from "@/types";
import { useBackClose } from "@/hooks/useBackClose";
import { BusyButton } from "@/components/Spinner";

export const AVATAR_COLORS = ["#ff2d55", "#e0a11c", "#2e9e4a", "#1f7ae0", "#8e2eea", "#e02e8e", "#2ec3c3", "#6b6b6b"];

export interface ProfileFormValues {
  name: string;
  age: number | null;
  isKids: boolean;
  isAdmin: boolean;
  maturityRating: string;
  birthday: string | null;
  pin: string | null;
  color: string;
  avatarFile: File | null;
  favoriteGenres: number[];
  timeEnabled: boolean;
  start: string;
  end: string;
}

interface Props {
  initial?: Profile;               // ausente = criando
  busy: boolean;
  error: string | null;
  onSubmit: (v: ProfileFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function ProfileFormModal({ initial, busy, error, onSubmit, onCancel, onDelete }: Props) {
  useBackClose(true, onCancel);
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  const [isKids, setIsKids] = useState(!!initial?.is_kids);
  const [isAdmin, setIsAdmin] = useState(!!initial?.is_admin);
  const [rating, setRating] = useState(initial?.is_kids ? "L" : initial?.maturity_rating ?? "16");
  const [birthday, setBirthday] = useState(initial?.birthday ?? "");
  const [pin, setPin] = useState(initial?.pin ?? "");
  const [color, setColor] = useState(initial?.color_theme ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
  const [file, setFile] = useState<File | null>(null);
  const [genres, setGenres] = useState<number[]>(initial?.favorite_genres ?? []);
  const [timeEnabled, setTimeEnabled] = useState(!!initial?.time_restriction_enabled);
  const [start, setStart] = useState(initial?.allowed_start_time ?? "08:00");
  const [end, setEnd] = useState(initial?.allowed_end_time ?? "20:00");
  const [localError, setLocalError] = useState<string | null>(null);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : initial?.avatar ?? null), [file, initial?.avatar]);
  useEffect(() => () => { if (file && preview) URL.revokeObjectURL(preview); }, [file, preview]);

  const genreList = useQuery({ queryKey: ["genres", "movie"], queryFn: () => tmdb.genres("movie"), enabled: editing, staleTime: Infinity });

  const toggleKids = (v: boolean) => {
    setIsKids(v);
    if (v) { setRating("L"); setIsAdmin(false); }
  };

  const submit = () => {
    const n = name.trim();
    if (!n) return setLocalError("Digite um nome para o perfil.");
    if (pin && !/^\d{4}$/.test(pin)) return setLocalError("O PIN deve ter exatamente 4 números.");
    setLocalError(null);
    onSubmit({
      name: n, age: age ? Number(age) : null, isKids, isAdmin: isKids ? false : isAdmin,
      maturityRating: isKids ? "L" : rating, birthday: birthday || null, pin: pin || null,
      color, avatarFile: file, favoriteGenres: genres, timeEnabled, start, end,
    });
  };

  const shownError = localError ?? error;

  return (
    <div className="modal-overlay" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-box modal-box-wide">
        <h2>{editing ? "Editar perfil" : "Criar novo perfil"}</h2>
        {!editing && <p className="modal-hint">Personalize como esse perfil aparece no ALXmovies.</p>}

        <div className="avatar-picker">
          <div className="avatar-picker-preview" style={preview ? undefined : { background: color }}>
            {preview ? <img src={preview} alt="" /> : (name.trim().charAt(0).toUpperCase() || "+")}
          </div>
          <div className="avatar-picker-actions">
            <label className="btn btn-secondary btn-file">
              {editing ? "Trocar foto" : "Escolher foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <span className="avatar-picker-or">ou escolha uma cor</span>
            <div className="color-swatches">
              {AVATAR_COLORS.map((c) => (
                <button key={c} type="button" className={`color-swatch ${c === color && !file ? "selected" : ""}`}
                  style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => { setColor(c); setFile(null); }} />
              ))}
            </div>
          </div>
        </div>

        <div className="field-row">
          <input type="text" placeholder="Nome do perfil" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" min={1} max={120} placeholder={editing ? "Idade" : "Idade (opcional)"} value={age} onChange={(e) => setAge(e.target.value)} />
        </div>

        <label className="checkbox-line">
          <input type="checkbox" checked={isKids} onChange={(e) => toggleKids(e.target.checked)} />
          Perfil infantil (só mostra conteúdo de família e animação)
        </label>
        {!editing && (
          <label className={`checkbox-line ${isKids ? "disabled" : ""}`}>
            <input type="checkbox" checked={isAdmin} disabled={isKids} onChange={(e) => setIsAdmin(e.target.checked)} />
            👑 Tornar este o perfil responsável (só um por vez — marcar aqui tira dos outros)
          </label>
        )}

        <div className={`rating-field ${isKids ? "disabled" : ""}`}>
          <label>Classificação indicativa</label>
          <select value={rating} disabled={isKids} onChange={(e) => setRating(e.target.value)}>
            {RATING_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {editing && (
          <>
            <label className={`checkbox-line ${isKids ? "disabled" : ""}`}>
              <input type="checkbox" checked={isAdmin} disabled={isKids} onChange={(e) => setIsAdmin(e.target.checked)} />
              👑 Tornar este o perfil responsável (só um por vez — marcar aqui tira dos outros)
            </label>

            <div className="genre-prefs-field">
              <label>Gêneros favoritos (aparecem primeiro na home)</label>
              <div className="genre-prefs-list">
                {genreList.data?.genres.map((g) => (
                  <label key={g.id} className="genre-pref-item">
                    <input type="checkbox" checked={genres.includes(g.id)}
                      onChange={(e) => setGenres((cur) => e.target.checked ? [...cur, g.id] : cur.filter((x) => x !== g.id))} />
                    {g.name}
                  </label>
                ))}
                {genreList.isError && <p className="account-note">Não foi possível carregar os gêneros agora.</p>}
              </div>
            </div>

            <label className="checkbox-line">
              <input type="checkbox" checked={timeEnabled} onChange={(e) => setTimeEnabled(e.target.checked)} />
              ⏰ Restringir horário de uso deste perfil
            </label>
            {timeEnabled && (
              <>
                <div className="field-row time-restriction-fields">
                  <div className="account-field"><label>Permitido a partir de</label><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                  <div className="account-field"><label>Até</label><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                </div>
                <p className="account-note">Se "até" for menor que "a partir de", a janela vira a madrugada (ex: 18:00 até 08:00 do dia seguinte).</p>
              </>
            )}
          </>
        )}

        <div className="account-field">
          <label>🎂 Aniversário (opcional)</label>
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </div>
        {editing && <p className="account-note">Quando bater com a data de hoje, o site mostra uma surpresa de aniversário automaticamente pra esse perfil. Só o dia e o mês contam — pode usar qualquer ano.</p>}
        <input type="password" inputMode="numeric" maxLength={4} placeholder="PIN de 4 dígitos (opcional)" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />

        {shownError && <p className="error-text" style={{ display: "block" }}>{shownError}</p>}

        <div className="modal-actions">
          <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
          <BusyButton className="btn btn-primary" loading={busy} onClick={submit}>{busy ? "Salvando…" : editing ? "Salvar" : "Criar perfil"}</BusyButton>
        </div>
        {onDelete && <button className="btn btn-danger" disabled={busy} onClick={onDelete}>🗑 Excluir perfil</button>}
      </div>
    </div>
  );
}
