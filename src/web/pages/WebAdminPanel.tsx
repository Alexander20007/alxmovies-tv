import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import {
  getStaffStatus, listProposals, myProposals, proposeAnnouncement, reviewProposal, revokeStaff, setStaffPublish, staffList,
} from "@/services/staff";
import { SitePage } from "../SitePage";

const STATUS = { pending: "Aguardando", approved: "Aprovado", rejected: "Recusado" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/** Painel dos admins (sugerir avisos, ver vantagens) + área do dono (aprovar sugestões e gerenciar a equipe). */
export default function WebAdminPanel() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const logged = !!user && !user.is_anonymous;
  const st = useQuery({ queryKey: ["staff-status", user?.id], queryFn: getStaffStatus, enabled: logged });
  const isOwner = st.data?.role === "dono";
  const isStaff = st.data?.role === "admin" || isOwner;
  const mine = useQuery({ queryKey: ["my-proposals"], queryFn: myProposals, enabled: isStaff && !isOwner });
  const pending = useQuery({ queryKey: ["pending-proposals"], queryFn: listProposals, enabled: isOwner });
  const team = useQuery({ queryKey: ["staff-list"], queryFn: staffList, enabled: isOwner });

  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (!loading && !logged) return <Navigate to="/entrar?next=/admin" replace />;
  if (st.isLoading || loading) return <SitePage title="Painel de admin"><p className="wb-dim" style={{ textAlign: "center" }}>Carregando…</p></SitePage>;
  if (!isStaff) return <Navigate to="/admin/teste" replace />;

  async function send() {
    if (busy) return;
    if (!title.trim() || !body.trim()) return setNote({ ok: false, text: "Escreva o título e a mensagem." });
    if (url.trim() && !/^https:\/\//i.test(url.trim())) return setNote({ ok: false, text: "O link precisa começar com https://" });
    setBusy(true); setNote(null);
    try {
      await proposeAnnouncement(title.trim(), body.trim(), url);
      setTitle(""); setBody(""); setUrl("");
      setNote({ ok: true, text: "Sugestão enviada! O dono vai analisar." });
      void qc.invalidateQueries({ queryKey: ["my-proposals"] });
    } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : "Não foi possível enviar." }); }
    finally { setBusy(false); }
  }

  const act = async (fn: () => Promise<void>, keys: string[]) => {
    try { await fn(); } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : "Não foi possível concluir." }); }
    keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <SitePage title={isOwner ? "Painel do dono" : "Painel de admin"} sub={isOwner ? "Aprove sugestões e gerencie a equipe." : "Suas vantagens e ferramentas."}>
      <section className="wb-card wb-acc">
        <small>{isOwner ? "Você é o dono" : "Você é admin"}</small>
        <ul className="wb-perks">
          <li>Plano <b>Premium incluso</b>: sem anúncios e com mais downloads por mês</li>
          <li>Selo de admin na sua conta</li>
          {st.data?.can_publish || isOwner
            ? <li>Pode <b>publicar avisos</b> direto: no app, Painel da conta → Avisos para todos</li>
            : <li>Pode <b>sugerir avisos</b> para todos (o dono aprova)</li>}
        </ul>
        <div className="wb-row"><Link className="wb-btn" to="/conta">Minha conta</Link></div>
      </section>

      {!isOwner && !st.data?.can_publish && (
        <section className="wb-card wb-acc">
          <small>Sugerir um aviso</small>
          <div className="wb-form" style={{ margin: 0, padding: 0, border: 0, background: "none", maxWidth: "none" }}>
            <label>Título<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Nova função no app" /></label>
            <label>Mensagem<textarea className="wb-ta" value={body} maxLength={500} rows={4} onChange={(e) => setBody(e.target.value)} placeholder="Escreva o aviso…" /></label>
            <label>Link (opcional)<input value={url} inputMode="url" onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
            {note && <p className={note.ok ? "wb-form-ok" : "wb-form-err"}>{note.text}</p>}
            <button type="button" className="wb-btn primary" disabled={busy} onClick={() => void send()}>{busy ? "Enviando…" : "Enviar sugestão"}</button>
          </div>
          {(mine.data ?? []).length > 0 && (
            <div className="wb-list">
              <small>Suas sugestões</small>
              {(mine.data ?? []).map((p) => (
                <div key={p.id} className="wb-list-row"><div><b>{p.title}</b><span>{p.body}</span></div><em className={`wb-chip ${p.status}`}>{STATUS[p.status]}</em></div>
              ))}
            </div>
          )}
        </section>
      )}

      {isOwner && (
        <>
          {note && <p className={note.ok ? "wb-form-ok" : "wb-form-err"}>{note.text}</p>}
          <section className="wb-card wb-acc">
            <small>Sugestões para aprovar ({(pending.data ?? []).length})</small>
            {(pending.data ?? []).length === 0 && <p className="wb-dim">Nenhuma sugestão esperando.</p>}
            {(pending.data ?? []).map((p) => (
              <div key={p.id} className="wb-list-row col">
                <div><b>{p.title}</b><span>{p.body}</span><small>{p.author_name} · {day(p.created_at)}{p.url ? ` · ${p.url}` : ""}</small></div>
                <div className="wb-row">
                  <button type="button" className="wb-btn primary" onClick={() => void act(() => reviewProposal(p.id, true), ["pending-proposals"])}>Aprovar e enviar</button>
                  <button type="button" className="wb-btn" onClick={() => void act(() => reviewProposal(p.id, false), ["pending-proposals"])}>Recusar</button>
                </div>
              </div>
            ))}
          </section>

          <section className="wb-card wb-acc">
            <small>Equipe ({(team.data ?? []).length})</small>
            {(team.data ?? []).length === 0 && <p className="wb-dim">Ainda não há admins.</p>}
            {(team.data ?? []).map((m) => (
              <div key={m.user_id} className="wb-list-row col">
                <div><b>{m.username}</b><small>Admin desde {day(m.since)} · {m.granted_via === "quiz" ? "passou no teste" : "colocado por você"}</small></div>
                <div className="wb-row">
                  <button type="button" className="wb-btn" onClick={() => void act(() => setStaffPublish(m.user_id, !m.can_publish), ["staff-list"])}>
                    {m.can_publish ? "Tirar “publicar sozinho”" : "Liberar “publicar sozinho”"}
                  </button>
                  <button type="button" className="wb-btn wb-out" onClick={() => { if (window.confirm(`Remover ${m.username} da equipe?`)) void act(() => revokeStaff(m.user_id), ["staff-list"]); }}>Remover</button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </SitePage>
  );
}
