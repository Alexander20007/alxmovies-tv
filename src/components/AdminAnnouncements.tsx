import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BusyButton } from "@/components/Spinner";
import { deleteAnnouncement, fetchAnnouncements, sendAnnouncement } from "@/services/announcements";
import { timeAgo } from "@/lib/social";

/** Painel do dono do app: escreve um aviso que aparece nas notificações de todo mundo (e na barra do celular). */
export function AdminAnnouncements() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["announcements"], queryFn: fetchAnnouncements, staleTime: 30_000 });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState(30);
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (busy) return;
    if (!title.trim() || !body.trim()) return setMsg({ ok: false, text: "Escreva o título e a mensagem." });
    if (url.trim() && !/^https:\/\//i.test(url.trim())) return setMsg({ ok: false, text: "O link precisa começar com https://" });
    setBusy(true); setMsg(null);
    try {
      await sendAnnouncement({ title: title.trim(), body: body.trim(), url, days, push });
      setTitle(""); setBody(""); setUrl("");
      setMsg({ ok: true, text: push ? "Aviso publicado e notificação enviada." : "Aviso publicado." });
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Não foi possível enviar." }); }
    finally { setBusy(false); }
  }

  async function remove(id: number) {
    try { await deleteAnnouncement(id); void qc.invalidateQueries({ queryKey: ["announcements"] }); }
    catch { setMsg({ ok: false, text: "Não foi possível apagar." }); }
  }

  return (
    <div className="adm-ann">
      <label>Título<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Novidades da versão 1.2" /></label>
      <label>Mensagem<textarea value={body} maxLength={500} rows={4} onChange={(e) => setBody(e.target.value)} placeholder="Escreva o aviso para os usuários…" /></label>
      <label>Link (opcional)<input value={url} inputMode="url" autoCapitalize="none" onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
      <div className="adm-row">
        <label>Fica visível por
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
          </select>
        </label>
        <label className="adm-check"><input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Enviar notificação para o celular</label>
      </div>
      {msg && <p className={`account-status ${msg.ok ? "ok" : "err"}`} style={{ display: "block" }}>{msg.text}</p>}
      <BusyButton type="button" className="account-btn" loading={busy} onClick={() => void send()}>Publicar aviso</BusyButton>

      {(list.data ?? []).length > 0 && (
        <div className="adm-list">
          <small>Avisos no ar</small>
          {(list.data ?? []).map((a) => (
            <div key={a.id} className="adm-item">
              <div><b>{a.title}</b><span>{a.body}</span><small>{timeAgo(a.created_at)}</small></div>
              <button type="button" onClick={() => void remove(a.id)}>Apagar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
