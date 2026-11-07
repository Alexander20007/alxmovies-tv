import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SocAvatar, SocialGate } from "@/components/social/SocUi";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useFriendships } from "@/hooks/useSocialData";
import { formatFriendCode, isLive, timeAgo, watchAlongHref, watchingLabel } from "@/lib/social";
import {
  blockFriendship, discoverProfiles, regenerateFriendCode, sendRequestTo, setDiscoverable, removeFriendship, respondToRequest, sendFriendRequest, unblockFriendship, updateSocialSettings,
} from "@/services/friends";
import { copyText, shareLink } from "@/lib/native";
import { useDebounce } from "@/hooks/useDebounce";
import { BusyButton } from "@/components/Spinner";
import { StaffName } from "@/components/VerifiedName";

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

function Note({ text, kind = "" }: { text: string; kind?: string }) {
  return <p className={`soc-note ${kind}`}>{text}</p>;
}

function FriendsContent() {
  const { activeProfile } = useProfile();
  const { settings } = useSocial();
  const profile = activeProfile!;
  const pid = profile.id;
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const lists = useFriendships();
  const state = lists.data ?? { friends: [], incoming: [], outgoing: [], blocked: [] };

  const [code, setCode] = useState(settings?.friend_code ?? "");
  const [codeMsg, setCodeMsg] = useState("");
  const [addCode, setAddCode] = useState("");
  const [addMsg, setAddMsg] = useState<{ text: string; kind: string }>({ text: "", kind: "" });
  const [priv, setPriv] = useState({ watching: !!settings?.show_watching, requests: !!settings?.accept_requests, discoverable: settings?.discoverable !== false });
  const [term, setTerm] = useState("");
  const q = useDebounce(term.trim());
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [findMsg, setFindMsg] = useState("");
  const [privMsg, setPrivMsg] = useState<{ text: string; kind: string }>({ text: "", kind: "" });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "add" | "mycode" | "search">(null);

  useEffect(() => {
    const invited = params.get("add");
    if (invited) {
      setAddCode(formatFriendCode(invited.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)));
      setAddMsg({ text: "Código do convite preenchido — toque em “Enviar pedido”.", kind: "" });
      setSheet("add");
    }
  }, [params]);
  useEffect(() => {
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["friendships", pid] });
  const flash = (msg: string) => { setCodeMsg(msg); setTimeout(() => setCodeMsg((m) => (m === msg ? "" : m)), 2500); };
  const shownCode = formatFriendCode(code);

  async function copyCode() {
    flash((await copyText(shownCode)) ? "Código copiado!" : "Não foi possível copiar. Selecione o código à mão.");
  }
  async function shareCode() {
    const text = `Me adiciona no ALXmovies! Meu código: ${shownCode}`;
    const url = `${window.location.origin}/amigos?add=${encodeURIComponent(code)}`;
    const r = await shareLink({ title: "ALXmovies", text, url });
    if (r === "copied") flash("Convite copiado!");
    else if (r === "failed") flash("Não foi possível compartilhar agora.");
  }
  async function newCode() {
    if (!window.confirm("Gerar um código novo? O código antigo deixa de funcionar (quem já é seu amigo continua amigo).")) return;
    try { setCode((await regenerateFriendCode(pid)).friend_code); flash("Código novo gerado."); }
    catch (e) { flash(e instanceof Error ? e.message : "Erro"); }
  }

  const add = useMutation({
    mutationFn: () => sendFriendRequest(pid, addCode.trim()),
    onSuccess: async () => { setAddCode(""); setAddMsg({ text: "Pedido enviado! Assim que a pessoa aceitar, vocês aparecem aqui.", kind: "ok" }); await refresh(); },
    onError: (e) => setAddMsg({ text: cap(e instanceof Error ? e.message : "Erro"), kind: "err" }),
  });

  // Sugestões (campo vazio) ou busca por nome (2+ letras)
  const discover = useQuery({
    queryKey: ["discover", pid, q],
    queryFn: () => discoverProfiles(pid, q),
    enabled: !profile.is_kids && (q.length === 0 || q.length >= 2),
    staleTime: 60_000,
    retry: false,
  });
  const invite = useMutation({
    mutationFn: (targetId: string) => sendRequestTo(pid, targetId),
    onSuccess: async (_r, targetId) => { setSent((s) => ({ ...s, [targetId]: true })); setFindMsg(""); await refresh(); },
    onError: (e) => setFindMsg(cap(e instanceof Error ? e.message : "Erro")),
  });

  const act = useMutation({
    mutationFn: async (a: { kind: "accept" | "decline" | "remove" | "block" | "unblock"; id: string }) => {
      if (a.kind === "accept") await respondToRequest(pid, a.id, true);
      else if (a.kind === "decline") await respondToRequest(pid, a.id, false);
      else if (a.kind === "remove") await removeFriendship(pid, a.id);
      else if (a.kind === "block") await blockFriendship(pid, a.id);
      else await unblockFriendship(pid, a.id);
    },
    onSuccess: refresh,
    onError: (e) => alert(cap(e instanceof Error ? e.message : "Erro")),
  });

  async function savePriv(patch: { show_watching?: boolean; accept_requests?: boolean; discoverable?: boolean }, revert: () => void) {
    try {
      if (patch.discoverable !== undefined) await setDiscoverable(pid, patch.discoverable);
      const { discoverable: _d, ...rest } = patch;
      if (Object.keys(rest).length) await updateSocialSettings(pid, rest);
      await qc.invalidateQueries({ queryKey: ["socialSettings", pid] });
      setPrivMsg({ text: "Salvo.", kind: "ok" });
      setTimeout(() => setPrivMsg({ text: "", kind: "" }), 1800);
    } catch (e) {
      revert();
      setPrivMsg({ text: cap(e instanceof Error ? e.message : "Erro"), kind: "err" });
    }
  }

  const confirmThen = (msg: string, kind: "remove" | "block", id: string) => { if (window.confirm(msg)) act.mutate({ kind, id }); };
  const toggleCls = "soc-switch";

  return (
    <div className="soc-page">
      <div className="soc-title-row">
        <h1>Amigos</h1>
        <Link className="soc-link-btn" to="/mensagens">💬 Mensagens</Link>
      </div>
      <div className="fr-actions">
        <button type="button" className="fr-act" onClick={() => { setAddMsg({ text: "", kind: "" }); setSheet("add"); }}><span className="fr-ico">＋</span><b>Adicionar</b><small>por código</small></button>
        <button type="button" className="fr-act" onClick={() => setSheet("mycode")}><span className="fr-ico">#</span><b>Meu código</b><small>ver e compartilhar</small></button>
        {!profile.is_kids && <button type="button" className="fr-act" onClick={() => setSheet("search")}><span className="fr-ico">🔍</span><b>Buscar</b><small>por nome</small></button>}
      </div>

      {!profile.is_kids && !q && (discover.data?.length ?? 0) > 0 && (
        <section className="soc-box">
          <h2>Pessoas que você pode conhecer</h2>
          <div className="fr-sugs">
            {(discover.data ?? []).slice(0, 12).map((p) => (
              <div key={p.profile_id} className="fr-sug">
                <SocAvatar name={p.name} avatar={p.avatar} color={p.color_theme} />
                <strong>{p.name}</strong>
                <span className="soc-muted">{p.mutual_count > 0 ? `${p.mutual_count} em comum` : "Sugestão"}</span>
                {sent[p.profile_id]
                  ? <span className="soc-muted">Enviado ✓</span>
                  : <button type="button" className="soc-btn primary sm" disabled={invite.isPending} onClick={() => invite.mutate(p.profile_id)}>Adicionar</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {state.incoming.length > 0 && (
        <section className="soc-box">
          <h2>Pedidos de amizade <span className="soc-count">({state.incoming.length})</span></h2>
          <div className="soc-list">
            {state.incoming.map((r) => (
              <div key={r.friendship_id} className="soc-row">
                <SocAvatar name={r.friend_name} avatar={r.friend_avatar} color={r.friend_color} />
                <div className="soc-row-main"><strong><StaffName name={r.friend_name} profileId={r.friend_id} /></strong><span className="soc-muted">quer ser seu amigo · {timeAgo(r.created_at)}</span></div>
                <div className="soc-row-actions">
                  <button type="button" className="soc-btn primary sm" disabled={act.isPending} onClick={() => act.mutate({ kind: "accept", id: r.friendship_id })}>Aceitar</button>
                  <button type="button" className="soc-btn sm" disabled={act.isPending} onClick={() => act.mutate({ kind: "decline", id: r.friendship_id })}>Recusar</button>
                  <button type="button" className="soc-btn ghost sm" onClick={() => confirmThen(`Bloquear ${r.friend_name}? Vocês deixam de ser amigos e ela não consegue te adicionar de novo.`, "block", r.friendship_id)}>Bloquear</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="soc-box">
        <h2>Seus amigos <span className="soc-count">{state.friends.length ? `(${state.friends.length})` : ""}</span></h2>
        <div className="soc-list">
          {lists.isLoading && <p className="soc-empty">Carregando...</p>}
          {lists.isError && <p className="soc-empty">{(lists.error as Error).message}</p>}
          {lists.data && !state.friends.length && <p className="soc-empty">Você ainda não tem amigos por aqui. Mande seu código ou adicione alguém pelo código dele.</p>}
          {state.friends.map((f) => {
            const live = isLive(f);
            return (
              <div key={f.friendship_id} className="soc-row friend">
                <SocAvatar name={f.friend_name} avatar={f.friend_avatar} color={f.friend_color} live={live} />
                <div className="soc-row-main">
                  <strong><StaffName name={f.friend_name} profileId={f.friend_id} /></strong>
                  {f.watching_title && (live
                    ? <span className="soc-status live">▶ Assistindo agora: <b>{watchingLabel(f)}</b></span>
                    : <span className="soc-status">Assistiu <b>{watchingLabel(f)}</b> · {timeAgo(f.watching_at)}</span>)}
                  {f.watching_title && live && <Link className="soc-along" to={watchAlongHref(f)}>▶ Assistir também</Link>}
                </div>
                <div className="soc-row-actions">
                  <Link className="soc-icon-btn" to={`/mensagens?chat=${f.friendship_id}`} aria-label="Enviar mensagem">
                    💬{f.unread_count > 0 && <span className="soc-pill">{f.unread_count}</span>}
                  </Link>
                  <div className="soc-menu-wrap" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="soc-icon-btn" aria-label="Mais opções" onClick={() => setMenuFor(menuFor === f.friendship_id ? null : f.friendship_id)}>⋯</button>
                    <div className={`soc-menu${menuFor === f.friendship_id ? " open" : ""}`}>
                      <button type="button" onClick={() => { setMenuFor(null); confirmThen(`Remover ${f.friend_name} dos seus amigos?`, "remove", f.friendship_id); }}>Remover amigo</button>
                      <button type="button" className="danger" onClick={() => { setMenuFor(null); confirmThen(`Bloquear ${f.friend_name}? Vocês deixam de ser amigos e ela não consegue te adicionar de novo.`, "block", f.friendship_id); }}>Bloquear</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {state.outgoing.length > 0 && (
        <section className="soc-box">
          <h2>Pedidos enviados</h2>
          <div className="soc-list">
            {state.outgoing.map((r) => (
              <div key={r.friendship_id} className="soc-row">
                <SocAvatar name={r.friend_name} avatar={r.friend_avatar} color={r.friend_color} />
                <div className="soc-row-main"><strong><StaffName name={r.friend_name} profileId={r.friend_id} /></strong><span className="soc-muted">aguardando resposta · {timeAgo(r.created_at)}</span></div>
                <div className="soc-row-actions"><button type="button" className="soc-btn sm" onClick={() => act.mutate({ kind: "remove", id: r.friendship_id })}>Cancelar</button></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="soc-box">
        <h2>Privacidade deste perfil</h2>
        <label className="soc-toggle">
          <span><b>Mostrar o que estou assistindo</b><small>Só seus amigos veem. Aparece enquanto você assiste e some quando você sai do player.</small></span>
          <span className={toggleCls}>
            <input type="checkbox" checked={priv.watching} disabled={!!profile.is_kids}
              onChange={(e) => { const v = e.target.checked; setPriv((p) => ({ ...p, watching: v })); void savePriv({ show_watching: v }, () => setPriv((p) => ({ ...p, watching: !v }))); }} /><i />
          </span>
        </label>
        <label className="soc-toggle">
          <span><b>Aceitar pedidos de amizade</b><small>Desligando, ninguém novo consegue te adicionar pelo código.</small></span>
          <span className={toggleCls}>
            <input type="checkbox" checked={priv.requests} disabled={!!profile.is_kids}
              onChange={(e) => { const v = e.target.checked; setPriv((p) => ({ ...p, requests: v })); void savePriv({ accept_requests: v }, () => setPriv((p) => ({ ...p, requests: !v }))); }} /><i />
          </span>
        </label>
        <label className="soc-toggle">
          <span><b>Aparecer em buscas e sugestões</b><small>Outras pessoas podem te achar pelo nome e receber você como sugestão. Desligando, só entram pelo seu código.</small></span>
          <span className={toggleCls}>
            <input type="checkbox" checked={priv.discoverable} disabled={!!profile.is_kids}
              onChange={(e) => { const v = e.target.checked; setPriv((p) => ({ ...p, discoverable: v })); void savePriv({ discoverable: v }, () => setPriv((p) => ({ ...p, discoverable: !v }))); }} /><i />
          </span>
        </label>
        <Note text={privMsg.text} kind={privMsg.kind} />
        {profile.is_kids && <p className="soc-note">As configurações deste perfil são controladas por quem é responsável pela conta (Painel da conta → Amigos e privacidade).</p>}
      </section>

      {state.blocked.length > 0 && (
        <section className="soc-box">
          <h2>Bloqueados</h2>
          <div className="soc-list">
            {state.blocked.map((r) => (
              <div key={r.friendship_id} className="soc-row">
                <SocAvatar name={r.friend_name} avatar={r.friend_avatar} color={r.friend_color} />
                <div className="soc-row-main"><strong><StaffName name={r.friend_name} profileId={r.friend_id} /></strong></div>
                <div className="soc-row-actions"><button type="button" className="soc-btn sm" onClick={() => act.mutate({ kind: "unblock", id: r.friendship_id })}>Desbloquear</button></div>
              </div>
            ))}
          </div>
        </section>
      )}
      {sheet && createPortal(
        <div className="salas-modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="salas-modal-box fr-sheet">
            <button type="button" className="salas-modal-close" onClick={() => setSheet(null)} aria-label="Fechar">×</button>
            {sheet === "add" && (<>
              <h2>Adicionar por código</h2>
              <div className="soc-add-row">
                <input type="text" placeholder="Ex: A1B2-C3D4" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus
                  value={addCode}
                  onChange={(e) => {
                    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
                    setAddCode(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && addCode.trim() && add.mutate()} />
              </div>
              <BusyButton type="button" className="soc-btn primary" loading={add.isPending}
                onClick={() => (addCode.trim() ? add.mutate() : setAddMsg({ text: "Digite o código do seu amigo.", kind: "err" }))}>
                {add.isPending ? "Enviando..." : "Enviar pedido"}
              </BusyButton>
              <Note text={addMsg.text} kind={addMsg.kind} />
            </>)}
            {sheet === "mycode" && (<>
              <h2>Seu código de amigo</h2>
              <div className="soc-code">{shownCode || "----"}</div>
              <div className="soc-btn-row center">
                <button type="button" className="soc-btn primary" onClick={() => void copyCode()}>Copiar</button>
                <button type="button" className="soc-btn" onClick={() => void shareCode()}>Compartilhar</button>
                <button type="button" className="soc-btn ghost" onClick={() => void newCode()}>Gerar novo</button>
              </div>
              <Note text={codeMsg} />
            </>)}
            {sheet === "search" && (<>
              <h2>Buscar pessoas</h2>
              <div className="soc-add-row">
                <input type="search" className="fr-search" placeholder="Digite o nome" autoComplete="off" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} />
              </div>
              <Note text={findMsg} kind="err" />
              <div className="soc-list fr-results">
                {discover.isLoading && <p className="soc-empty">Procurando...</p>}
                {discover.isError && <p className="soc-empty">Busca indisponível: rode o arquivo sql/amigos/parte-8-buscar-e-sugestoes.sql no Supabase.</p>}
                {q.length === 1 && <p className="soc-empty">Digite pelo menos 2 letras.</p>}
                {discover.data && !discover.data.length && q.length !== 1 && <p className="soc-empty">{q ? `Ninguém encontrado para “${q}”.` : "Sem sugestões por enquanto."}</p>}
                {(q.length === 1 ? [] : discover.data ?? []).map((p) => (
                  <div key={p.profile_id} className="soc-row">
                    <SocAvatar name={p.name} avatar={p.avatar} color={p.color_theme} />
                    <div className="soc-row-main"><strong>{p.name}</strong><span className="soc-muted">{p.mutual_count > 0 ? `${p.mutual_count} em comum` : "Sugestão"}</span></div>
                    <div className="soc-row-actions">
                      {sent[p.profile_id] ? <span className="soc-muted">Enviado ✓</span>
                        : <button type="button" className="soc-btn primary sm" disabled={invite.isPending} onClick={() => invite.mutate(p.profile_id)}>Adicionar</button>}
                    </div>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function Friends() {
  return <SocialGate><FriendsContent /></SocialGate>;
}
