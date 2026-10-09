import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import {
  disableBiometric, isBiometricEnabled, isPlatformAuthenticatorAvailable, isWebAuthnSupported, registerBiometric,
} from "@/lib/biometric";
import { getPreferences, savePreferences, type Preferences } from "@/lib/preferences";
import { formatFriendCode } from "@/lib/social";
import {
  generateGuestRecoveryCode, getProfileActivitySummary, getSubscription, reauthenticate, updateAccountInfo, updatePassword, upgradeGuestAccount,
} from "@/services/account";
import { getFavoriteChannels, removeFavoriteChannelByStream, channelGroupLabel } from "@/services/channels";
import { getSocialSettings, updateSocialSettings, type SocialSettings } from "@/services/friends";
import { isNative } from "@/lib/native";
import { BusyButton } from "@/components/Spinner";
import { Icon, type IconName } from "@/components/Icon";

type Status = { kind: "ok" | "err"; text: string } | null;
const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado");

function StatusLine({ s }: { s: Status }) {
  return s ? <p className={`account-status ${s.kind}`} style={{ display: "block" }}>{s.text}</p> : null;
}

const CARD_ICONS: Record<string, IconName> = {
  "👤": "user", "🔒": "lock", "🧑‍🤝‍🧑": "users", "👥": "users", "💳": "card", "⚙": "settings", "📡": "tv", "📊": "list", "📜": "shield", "🚪": "logout",
};

function Card({ id, icon, title, sub, open, onToggle, pro, children }: {
  id: string; icon: string; title: string; sub: string; open: boolean; onToggle: () => void; pro?: boolean; children: ReactNode;
}) {
  return (
    <div className={`account-card${pro ? " pro" : ""}${open ? " open" : ""}`} id={id}>
      <button type="button" className="account-card-head" onClick={onToggle}>
        <span className="account-card-ico">{isNative && CARD_ICONS[icon] ? <Icon name={CARD_ICONS[icon]} size={22} /> : icon}</span>
        <span className="account-card-headtext"><b>{title}</b><small>{sub}</small></span>
        <span className="account-card-arrow">›</span>
      </button>
      <div className="account-card-body">{children}</div>
    </div>
  );
}

const Toggle = ({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) => (
  <div className="toggle-row">
    <span>{label}</span>
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
    </label>
  </div>
);

// ---------------- seções ----------------
function DataSection() {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const [username, setUsername] = useState<string>(meta.username ?? "");
  const [phone, setPhone] = useState<string>(meta.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function save() {
    setBusy(true); setStatus(null);
    try { await updateAccountInfo({ username: username.trim(), phone: phone.trim() }); setStatus({ kind: "ok", text: "Dados atualizados com sucesso." }); }
    catch (e) { setStatus({ kind: "err", text: "Erro ao salvar: " + msg(e) }); }
    finally { setBusy(false); }
  }
  return (
    <>
      <div className="account-field"><label>E-mail</label><input value={user?.email ?? ""} readOnly /></div>
      <div className="account-field"><label>Nome de usuário</label><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Como quer ser chamado" /></div>
      <div className="account-field"><label>Telefone</label><input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" /></div>
      <div className="account-field"><label>Conta criada em</label>
        <input readOnly value={user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—"} />
      </div>
      <StatusLine s={status} />
      <BusyButton className="account-btn" loading={busy} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar dados"}</BusyButton>
    </>
  );
}

function SecuritySection() {
  const { user } = useAuth();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [bio, setBio] = useState({ supported: true, available: true, enabled: false, note: "Verificando suporte do dispositivo..." });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isNative) return alive && setBio({ supported: false, available: false, enabled: false, note: "O bloqueio por biometria no app Android chega numa próxima versão." });
      if (!isWebAuthnSupported()) return alive && setBio({ supported: false, available: false, enabled: false, note: "Seu navegador não suporta biometria (WebAuthn)." });
      if (!(await isPlatformAuthenticatorAvailable())) return alive && setBio({ supported: true, available: false, enabled: false, note: "Não encontramos leitor biométrico (digital/rosto) neste dispositivo." });
      const enabled = isBiometricEnabled(user?.id);
      if (alive) setBio({ supported: true, available: true, enabled, note: enabled
        ? "Ativado — o ALXmovies vai pedir sua biometria ao abrir neste dispositivo."
        : "Ative para desbloquear o app com digital, rosto ou Windows Hello, em vez de digitar a senha toda vez." });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  async function savePassword() {
    setStatus(null);
    if (p1.length < 6) return setStatus({ kind: "err", text: "A senha precisa ter pelo menos 6 caracteres." });
    if (p1 !== p2) return setStatus({ kind: "err", text: "As senhas não coincidem." });
    setBusy(true);
    try { await updatePassword(p1); setStatus({ kind: "ok", text: "Senha atualizada com sucesso." }); setP1(""); setP2(""); }
    catch (e) { setStatus({ kind: "err", text: "Erro ao atualizar: " + msg(e) }); }
    finally { setBusy(false); }
  }

  async function toggleBio(on: boolean) {
    if (!user) return;
    if (on) {
      setBio((b) => ({ ...b, note: "Siga a instrução do seu dispositivo..." }));
      try { await registerBiometric(user); setBio((b) => ({ ...b, enabled: true, note: "Ativado — o ALXmovies vai pedir sua biometria ao abrir neste dispositivo." })); }
      catch (e) { setBio((b) => ({ ...b, enabled: false, note: "Não foi possível ativar: " + msg(e) })); }
    } else {
      disableBiometric(user.id);
      setBio((b) => ({ ...b, enabled: false, note: "Desativado neste dispositivo." }));
    }
  }

  return (
    <>
      <div className="account-field"><label>Nova senha</label><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></div>
      <div className="account-field"><label>Confirmar nova senha</label><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Repita a nova senha" autoComplete="new-password" /></div>
      <StatusLine s={status} />
      <BusyButton className="account-btn" loading={busy} onClick={() => void savePassword()}>{busy ? "Atualizando..." : "Atualizar senha"}</BusyButton>
      <div style={{ marginTop: 10, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
        <Toggle label="Bloqueio biométrico neste dispositivo" checked={bio.enabled} disabled={!bio.supported || !bio.available} onChange={(v) => void toggleBio(v)} />
      </div>
      <p className="account-note">{bio.note}</p>
    </>
  );
}

function ProfilesSection() {
  const { profiles } = useProfile();
  return (
    <>
      <div>
        {!profiles.length && <p className="account-note">Nenhum perfil criado ainda.</p>}
        {profiles.map((p) => (
          <div key={p.id} className="mini-profile-row">
            <div className="mini-profile-avatar" style={p.avatar ? undefined : { background: p.color_theme || "#333" }}>
              {p.avatar ? <img src={p.avatar} alt={p.name} onError={(e) => e.currentTarget.remove()} /> : (p.name || "?").charAt(0).toUpperCase()}
            </div>
            <span>{p.name}{p.is_kids ? " · infantil" : ""}</span>
            <small>{p.age ? `${p.age} anos` : ""}</small>
          </div>
        ))}
      </div>
      <Link to="/manage-profiles" className="account-btn secondary" style={{ textDecoration: "none", display: "inline-block" }}>Gerenciar perfis</Link>
    </>
  );
}

const FRIEND_TOGGLES: { key: "friends_enabled" | "show_watching" | "accept_requests"; label: string; needsFriends?: boolean }[] = [
  { key: "friends_enabled", label: "Amizades e mensagens neste perfil" },
  { key: "show_watching", label: "Mostrar o que está assistindo", needsFriends: true },
  { key: "accept_requests", label: "Aceitar pedidos de amizade", needsFriends: true },
];

function FriendsPrivacySection() {
  const { profiles, activeProfile } = useProfile();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const rows = useQuery({
    queryKey: ["friendsPrivacy", profiles.map((p) => p.id)],
    queryFn: () => Promise.all(profiles.map(async (p) => ({ profile: p, settings: await getSocialSettings(p.id) }))),
    retry: false,
  });

  async function change(pid: string, key: keyof Pick<SocialSettings, "friends_enabled" | "show_watching" | "accept_requests">, value: boolean) {
    setBusy(true); setStatus(null);
    try {
      await updateSocialSettings(pid, { [key]: value });
      await qc.invalidateQueries({ queryKey: ["friendsPrivacy"] });
      if (pid === activeProfile?.id) await qc.invalidateQueries({ queryKey: ["socialSettings", pid] });
      setStatus({ kind: "ok", text: "Configuração salva." });
    } catch (e) { setStatus({ kind: "err", text: "Erro ao salvar: " + msg(e) }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <p className="account-note" style={{ marginTop: 0 }}>
        Cada perfil tem seus próprios amigos. Perfis infantis começam com amizades <b>desligadas</b> — só você, como responsável, pode ligar.
        “Mostrar o que está assistindo” vem desligado em todos os perfis e só os amigos do perfil veem.
      </p>
      {rows.isLoading && <p className="account-note">Carregando...</p>}
      {rows.isError && <p className="account-note" style={{ color: "#e0a11c" }}>{msg(rows.error)}</p>}
      {rows.data?.map(({ profile, settings }) => (
        <div key={profile.id} className="activity-profile-card">
          <h3>{profile.is_admin ? "👑 " : ""}{profile.name}{profile.is_kids ? " · infantil" : ""}</h3>
          {FRIEND_TOGGLES.map((t) => (
            <Toggle key={t.key} label={t.label} checked={!!settings[t.key]} disabled={busy || (t.needsFriends && !settings.friends_enabled)}
              onChange={(v) => void change(profile.id, t.key, v)} />
          ))}
          <p className="account-note" style={{ marginTop: 6 }}>Código de amigo: <b>{formatFriendCode(settings.friend_code)}</b></p>
        </div>
      ))}
      <StatusLine s={status} />
    </>
  );
}

function SubscriptionSection() {
  const sub = useQuery({ queryKey: ["subscription"], queryFn: getSubscription, retry: false });
  if (sub.isLoading) return <span className="plan-badge inactive">Carregando...</span>;
  if (sub.isError) return <span className="plan-badge inactive">Não foi possível carregar</span>;
  const s = sub.data;
  if (s && s.status === "active") {
    return (
      <>
        <span className="plan-badge active">✔ Plano ativo{s.plan ? ` — ${s.plan}` : ""}</span>
        <p className="account-note" style={{ marginTop: 10 }}>{s.current_period_end ? `Renova em ${new Date(s.current_period_end).toLocaleDateString("pt-BR")}` : ""}</p>
      </>
    );
  }
  return (
    <>
      <span className="plan-badge inactive">Sem assinatura ativa</span>
      <p className="account-note" style={{ marginTop: 10 }}>Você está usando o ALXmovies no plano gratuito/padrão.</p>
    </>
  );
}

function PreferencesSection() {
  const [prefs, setPrefs] = useState<Preferences>(getPreferences);
  const set = (patch: Preferences) => setPrefs((cur) => { const next = { ...cur, ...patch }; savePreferences(next); return next; });
  return (
    <>
      <Toggle label="Modo economia de dados" checked={!!prefs.datasaver} onChange={(v) => set({ datasaver: v })} />
      <p className="account-note" style={{ marginTop: -6 }}>Carrega as capas dos filmes e séries em qualidade menor nas listas, usando bem menos dados do seu plano de internet.</p>
      <Toggle label="Avisos por e-mail de lançamentos" checked={!!prefs.emails} onChange={(v) => set({ emails: v })} />
      <p className="account-note" style={{ marginTop: -6, color: "#e0a11c" }}>
        ⚠ Ainda não está funcionando de verdade — a preferência é salva, mas o envio de e-mails automáticos ainda não foi implementado (depende de um serviço de e-mail à parte).
      </p>
    </>
  );
}

function ChannelFavoritesSection() {
  const { activeProfile } = useProfile();
  const qc = useQueryClient();
  const pid = activeProfile!.id;
  const favs = useQuery({ queryKey: ["chanFavs", pid], queryFn: () => getFavoriteChannels(pid) });
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(stream: string) {
    setBusy(stream);
    try { await removeFavoriteChannelByStream(pid, stream); await qc.invalidateQueries({ queryKey: ["chanFavs", pid] }); }
    finally { setBusy(null); }
  }

  if (favs.isLoading) return <p className="account-note">Carregando canais favoritos...</p>;
  if (favs.isError) return <p className="account-note">Não foi possível carregar seus canais favoritos agora.</p>;
  if (!favs.data?.length) return <p className="account-note">Nenhum canal favoritado ainda — toque no ♡ ao lado de um canal, em qualquer tela de Canais, pra favoritar.</p>;
  return (
    <div className="channel-prefs-list">
      {favs.data.map((c) => (
        <div key={c.stream} className="channel-fav-item">
          <img src={c.logo || "/assets/no-poster.png"} alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
          <div className="channel-fav-info"><strong>{c.name}</strong><span>{channelGroupLabel(c.group)}</span></div>
          <button type="button" className="channel-fav-remove" aria-label="Remover" disabled={busy === c.stream} onClick={() => void remove(c.stream)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function ActivitySection() {
  const { profiles } = useProfile();
  const report = useQuery({
    queryKey: ["activityReport", profiles.map((p) => p.id)],
    queryFn: () => Promise.all(profiles.map(async (p) => ({ profile: p, summary: await getProfileActivitySummary(p.id) }))),
    retry: false,
  });
  if (report.isLoading) return <p className="account-note">Carregando atividade...</p>;
  if (report.isError) return <p className="account-note">Não foi possível carregar o relatório agora.</p>;
  return (
    <div id="activity-report-list">
      {report.data?.map(({ profile, summary }) => (
        <div key={profile.id} className="activity-profile-card">
          <h3>{profile.is_admin ? "👑 " : ""}{profile.name}</h3>
          <div className="activity-stats-row">
            <div className="activity-stat"><strong>{summary.watchedCount}</strong><span>concluídos</span></div>
            <div className="activity-stat"><strong>{summary.inProgressCount}</strong><span>em andamento</span></div>
            <div className="activity-stat"><strong>{summary.favoriteChannelsCount}</strong><span>canais favoritos</span></div>
          </div>
          {summary.recentlyWatched.length > 0
            ? <ul className="activity-recent-list">{summary.recentlyWatched.map((i) => (
                <li key={`${i.media_type}-${i.media_id}`}>{i.title || "Título"} {(i.progress ?? 0) >= 95 ? "✅" : `(${Math.round(i.progress || 0)}%)`}</li>
              ))}</ul>
            : <p className="account-note">Nada assistido ainda.</p>}
        </div>
      ))}
    </div>
  );
}

function SessionSection() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const requestDeletion = () => {
    const subject = encodeURIComponent("Solicitação de exclusão de conta - ALXmovies");
    const body = encodeURIComponent(`Olá, gostaria de solicitar a exclusão definitiva da minha conta ALXmovies (${user?.email || ""}).`);
    window.location.href = `mailto:alxmovies.tv@gmail.com?subject=${subject}&body=${body}`;
  };
  return (
    <>
      <button className="account-btn secondary" onClick={() => void signOut().then(() => navigate("/login"))}>Sair da conta neste dispositivo</button>
      <button className="account-btn danger" onClick={requestDeletion}>Solicitar exclusão da conta</button>
      <p className="account-note">A exclusão definitiva remove a conta, todos os perfis, favoritos e histórico. Como essa ação não pode ser desfeita automaticamente pelo app, ela é confirmada por e-mail com nossa equipe.</p>
    </>
  );
}

// ---------------- convidado ----------------
function GuestPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [upStatus, setUpStatus] = useState<Status>(null);
  const [codeStatus, setCodeStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function upgrade(e: FormEvent) {
    e.preventDefault(); setBusy(true); setUpStatus(null);
    try { await upgradeGuestAccount({ email, password, username }); setUpStatus({ kind: "ok", text: "Conta criada! Confirme o e-mail se solicitado." }); }
    catch (err) { setUpStatus({ kind: "err", text: msg(err) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="account-screen" style={{ display: "block" }}>
      <div className="account-profile-card">
        <div className="account-header-avatar">🎭</div>
        <div className="account-profile-info"><h1>Você está como convidado</h1><p>A sessão de convidado dura 24h. Crie uma conta para manter seus dados.</p></div>
      </div>
      <div className="account-list">
        <Card id="criar" icon="✨" title="Criar conta" sub="Transforme este acesso em uma conta de verdade" open onToggle={() => {}}>
          <form onSubmit={(e) => void upgrade(e)}>
            <div className="account-field"><label>Nome de usuário</label><input value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
            <div className="account-field"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="account-field"><label>Senha</label><input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <StatusLine s={upStatus} />
            <BusyButton className="account-btn" loading={busy}>Criar conta</BusyButton>
          </form>
        </Card>
        <Card id="codigo" icon="🔑" title="Código de recuperação" sub="Volte a esta sessão de convidado em outro aparelho" open onToggle={() => {}}>
          <button className="account-btn secondary" onClick={() => void generateGuestRecoveryCode().then((c) => { setCode(c); setCodeStatus({ kind: "ok", text: "Código gerado. Guarde-o em local seguro." }); }).catch((e) => setCodeStatus({ kind: "err", text: msg(e) }))}>Gerar código</button>
          {code && <p><strong style={{ letterSpacing: 2 }}>{code}</strong></p>}
          <StatusLine s={codeStatus} />
        </Card>
      </div>
    </div>
  );
}

// ---------------- página ----------------
export default function Account() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const hash = useLocation().hash.replace("#", "");
  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [gateError, setGateError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set([hash || "dados"]));

  const toggle = (id: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  useEffect(() => {
    if (unlocked && hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }, [unlocked, hash]);

  const gateBox = (icon: string, title: string, text: string, to: string, label: string) => (
    <div className="account-gate" style={{ display: "flex" }}>
      <div className="account-gate-box">
        <div className="lock-icon">{icon}</div>
        <h1>{title}</h1>
        <p>{text}</p>
        <Link to={to} className="account-btn" style={{ textDecoration: "none", textAlign: "center", display: "block" }}>{label}</Link>
        <Link to="/home" style={{ color: "#888", fontSize: "0.82rem", textDecoration: "none" }}>← Voltar ao início</Link>
      </div>
    </div>
  );

  if (user?.is_anonymous) return <GuestPanel />;
  if (!activeProfile?.is_admin) {
    return gateBox("🔒", "Esse perfil não tem acesso",
      'O Painel da Conta só pode ser aberto por um perfil marcado como responsável. Troque para um perfil com essa permissão pra continuar (isso se configura em "Editar perfis").',
      "/profiles", "Trocar de perfil");
  }

  async function unlock() {
    if (!pw) return setGateError("Digite sua senha.");
    setBusy(true); setGateError("");
    try { await reauthenticate(pw); setUnlocked(true); }
    catch { setGateError("Senha incorreta. Tente novamente."); }
    finally { setBusy(false); }
  }

  if (!unlocked) {
    return (
      <div className="account-gate" style={{ display: "flex" }}>
        <div className="account-gate-box">
          <div className="lock-icon">🔒</div>
          <h1>Confirme sua senha</h1>
          <p>Por segurança, digite a senha da sua conta para abrir o Painel da Conta.</p>
          <input type="password" placeholder="Senha" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void unlock()} />
          {gateError && <p className="account-status err" style={{ display: "block" }}>{gateError}</p>}
          <BusyButton className="account-btn" loading={busy} style={{ alignSelf: "stretch", justifyContent: "center" }} onClick={() => void unlock()}>{busy ? "Verificando..." : "Desbloquear painel"}</BusyButton>
          <Link to="/home" style={{ color: "#888", fontSize: "0.82rem", textDecoration: "none" }}>← Voltar ao início</Link>
        </div>
      </div>
    );
  }

  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const card = (id: string, icon: string, title: string, sub: string, body: ReactNode, pro?: boolean) => (
    <Card id={id} icon={icon} title={title} sub={sub} open={open.has(id)} onToggle={() => toggle(id)} pro={pro}>{body}</Card>
  );

  return (
    <div className="account-screen" style={{ display: "block" }}>
      <div className="account-profile-card">
        <div className="account-header-avatar">{(meta.username || user?.email || "?").charAt(0).toUpperCase()}</div>
        <div className="account-profile-info"><h1>Minha conta</h1><p>{user?.email}</p></div>
      </div>

      <div className="account-list">
        {card("dados", "👤", "Dados da conta", "E-mail, nome de usuário e telefone", <DataSection />)}
        {card("seguranca", "🔒", "Segurança", "Senha e desbloqueio por biometria", <SecuritySection />)}
        {card("perfis", "🧑‍🤝‍🧑", "Perfis desta conta", "Todos os perfis vinculados à conta", <ProfilesSection />)}
        {card("amigos-privacidade", "👥", "Amigos e privacidade", "Quem pode ter amigos e mostrar o que assiste", <FriendsPrivacySection />)}
        {card("assinatura", "💳", "Assinatura", "Status do seu plano no ALXmovies", <SubscriptionSection />, true)}
        {card("preferencias", "⚙", "Preferências", "Economia de dados e e-mails", <PreferencesSection />)}
        {card("canais-favoritos", "📡", "Canais favoritos", "Canais marcados com ♡ em Canais", <ChannelFavoritesSection />)}
        {card("relatorio-atividade", "📊", "Relatório de atividade", "Contagens reais de cada perfil", <ActivitySection />)}
        {card("politicas", "📜", "Políticas e segurança", "Privacidade, cookies e segurança da conta", (
          <>
            <Link to="/privacidade" className="account-policy-link">🔐 Política de Privacidade <span>›</span></Link>
            <Link to="/cookies" className="account-policy-link">🍪 Política de Cookies <span>›</span></Link>
            <Link to="/seguranca" className="account-policy-link">🛡 Política de Segurança <span>›</span></Link>
            <p className="account-note" style={{ marginTop: 4 }}>Este produto usa a API do TMDB, mas não é endossado ou certificado pelo TMDB.</p>
          </>
        ))}
        {card("sessao", "🚪", "Sessão e conta", "Sair ou excluir a conta principal", <SessionSection />)}
      </div>
    </div>
  );
}
