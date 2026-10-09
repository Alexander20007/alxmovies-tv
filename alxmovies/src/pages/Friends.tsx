import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SocAvatar, SocialGate } from "@/components/social/SocUi";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useFriendships } from "@/hooks/useSocialData";
import { formatFriendCode, isLive, timeAgo, watchAlongHref, watchingLabel } from "@/lib/social";
import {
  blockFriendship, regenerateFriendCode, removeFriendship, respondToRequest, sendFriendRequest, unblockFriendship, updateSocialSettings,
} from "@/services/friends";
import { copyText, shareLink } from "@/lib/native";
import { BusyButton } from "@/components/Spinner";

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
  const [priv, setPriv] = useState({ watching: !!settings?.show_watching, requests: !!settings?.accept_requests });
  const [privMsg, setPrivMsg] = useState<{ text: string; kind: string }>({ text: "", kind: "" });
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    const invited = params.get("add");
    if (invited) {
      setAddCode(formatFriendCode(invited.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)));
      setAddMsg({ text: "Código do convite preenchido — toque em “Enviar pedido”.", kind: "" });
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

  async function savePriv(patch: { show_watching?: boolean; accept_requests?: boolean }, revert: () => void) {
    try {
      await updateSocialSettings(pid, patch);
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
      <p className="soc-sub">Adicione amigos pelo código, converse e veja o que eles estão assistindo.</p>

      <section className="soc-box">
        <small className="soc-label">Seu código de amigo</small>
        <div className="soc-code">{shownCode || "----"}</div>
        <div className="soc-btn-row">
          <button type="button" className="soc-btn primary" onClick={() => void copyCode()}>Copiar código</button>
          <button type="button" className="soc-btn" onClick={() => void shareCode()}>Compartilhar convite</button>
          <button type="button" className="soc-btn ghost" onClick={() => void newCode()}>Gerar novo</button>
        </div>
        <Note text={codeMsg} />
      </section>

      <section className="soc-box">
        <h2>Adicionar amigo</h2>
        <div className="soc-add-row">
          <input type="text" placeholder="Código do amigo (ex: A1B2-C3D4)" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            value={addCode}
            onChange={(e) => {
              const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
              setAddCode(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
            }}
            onKeyDown={(e) => e.key === "Enter" && addCode.trim() && add.mutate()} />
          <BusyButton type="button" className="soc-btn primary" loading={add.isPending}
            onClick={() => (addCode.trim() ? add.mutate() : setAddMsg({ text: "Digite o código do seu amigo.", kind: "err" }))}>
            {add.isPending ? "Enviando..." : "Enviar pedido"}
          </BusyButton>
        </div>
        <Note text={addMsg.text} kind={addMsg.kind} />
      </section>

      {state.incoming.length > 0 && (
        <section className="soc-box">
          <h2>Pedidos de amizade <span className="soc-count">({state.incoming.length})</span></h2>
          <div className="soc-list">
            {state.incoming.map((r) => (
              <div key={r.friendship_id} className="soc-row">
                <SocAvatar name={r.friend_name} avatar={r.friend_avatar} color={r.friend_color} />
                <div className="soc-row-main"><strong>{r.friend_name}</strong><span className="soc-muted">quer ser seu amigo · {timeAgo(r.created_at)}</span></div>
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
                  <strong>{f.friend_name}</strong>
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
                <div className="soc-row-main"><strong>{r.friend_name}</strong><span className="soc-muted">aguardando resposta · {timeAgo(r.created_at)}</span></div>
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
                <div className="soc-row-main"><strong>{r.friend_name}</strong></div>
                <div className="soc-row-actions"><button type="button" className="soc-btn sm" onClick={() => act.mutate({ kind: "unblock", id: r.friendship_id })}>Desbloquear</button></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function Friends() {
  return <SocialGate><FriendsContent /></SocialGate>;
}
