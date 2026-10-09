import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addComment, deleteComment, fetchCommentLikes, fetchComments, toggleCommentLike, type CommentRow } from "@/services/social";
import type { MediaType } from "@/types";
import { useBackClose } from "@/hooks/useBackClose";
import { BusyButton } from "@/components/Spinner";

const fail = (msg: string) => (e: unknown) => alert(`${msg}: ${e instanceof Error ? e.message : "tente de novo"}`);

interface ItemProps {
  c: CommentRow; isReply: boolean; mine: boolean;
  likes: { count: number; likedByMe: boolean };
  replying: boolean; replyText: string; busy: boolean;
  onLike: () => void; onDelete: () => void; onToggleReply: () => void;
  onReplyText: (v: string) => void; onSubmitReply: () => void;
}

function CommentItem(p: ItemProps) {
  const name = p.c.profiles?.name || "Usuário";
  return (
    <div className={`comment-item${p.isReply ? " comment-reply" : ""}`}>
      <div className="comment-avatar">{name.charAt(0).toUpperCase()}</div>
      <div className="comment-body">
        <div className="comment-meta"><strong>{name}</strong> <span>{new Date(p.c.created_at).toLocaleDateString("pt-BR")}</span></div>
        <p>{p.c.body}</p>
        <div className="comment-actions">
          <button className={`comment-like-btn${p.likes.likedByMe ? " active" : ""}`} disabled={p.busy} onClick={p.onLike}>
            {p.likes.likedByMe ? "❤️" : "🤍"} {p.likes.count > 0 ? p.likes.count : ""}
          </button>
          {!p.isReply && <button className="comment-reply-btn" onClick={p.onToggleReply}>Responder</button>}
          {p.mine && <button className="comment-delete" onClick={p.onDelete}>Excluir</button>}
        </div>
        {p.replying && (
          <div className="comment-reply-form" style={{ display: "flex" }}>
            <textarea autoFocus placeholder={`Responder ${name}...`} maxLength={500} value={p.replyText} onChange={(e) => p.onReplyText(e.target.value)} />
            <button className="comment-reply-submit" disabled={p.busy || !p.replyText.trim()} onClick={p.onSubmitReply}>Responder</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentsSection({ type, id, profileId }: { type: MediaType; id: number; profileId: string }) {
  const qc = useQueryClient();
  const comments = useQuery({ queryKey: ["comments", type, id], queryFn: () => fetchComments(id, type) });
  const ids = useMemo(() => (comments.data ?? []).map((c) => c.id), [comments.data]);
  const likes = useQuery({ queryKey: ["commentLikes", profileId, ids], queryFn: () => fetchCommentLikes(ids, profileId), enabled: ids.length > 0 });

  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["comments", type, id] }),
    qc.invalidateQueries({ queryKey: ["commentLikes"] }),
  ]);

  const like = useMutation({ mutationFn: (cid: string) => toggleCommentLike(profileId, cid), onSuccess: refresh, onError: fail("Não foi possível curtir agora") });
  const remove = useMutation({ mutationFn: deleteComment, onSuccess: refresh, onError: fail("Não foi possível excluir") });
  const reply = useMutation({
    mutationFn: (parent: string) => addComment(profileId, id, type, replyText.trim(), parent),
    onSuccess: async () => { setReplyOpen(null); setReplyText(""); await refresh(); },
    onError: fail("Não foi possível responder"),
  });

  const { roots, byParent } = useMemo(() => {
    const all = comments.data ?? [];
    const map = new Map<string, CommentRow[]>();
    all.filter((c) => c.parent_comment_id).forEach((c) => map.set(c.parent_comment_id!, [...(map.get(c.parent_comment_id!) ?? []), c]));
    return { roots: all.filter((c) => !c.parent_comment_id), byParent: map };
  }, [comments.data]);

  const render = (c: CommentRow, isReply: boolean) => (
    <CommentItem key={c.id} c={c} isReply={isReply} mine={c.profile_id === profileId}
      likes={likes.data?.[c.id] ?? { count: 0, likedByMe: false }}
      busy={like.isPending || reply.isPending}
      replying={replyOpen === c.id} replyText={replyText}
      onLike={() => like.mutate(c.id)}
      onDelete={() => window.confirm("Excluir este comentário?") && remove.mutate(c.id)}
      onToggleReply={() => { setReplyText(""); setReplyOpen(replyOpen === c.id ? null : c.id); }}
      onReplyText={setReplyText} onSubmitReply={() => reply.mutate(c.id)} />
  );

  return (
    <div className="details-section" id="comments-section">
      <h3>Comentários</h3>
      <div className="comments-list">
        {comments.isLoading && <p style={{ color: "#888", fontSize: "0.9rem" }}>Carregando comentários…</p>}
        {comments.isError && <p style={{ color: "#888", fontSize: "0.9rem" }}>Não foi possível carregar os comentários.</p>}
        {comments.data && !roots.length && <p style={{ color: "#888", fontSize: "0.9rem" }}>Seja o primeiro a comentar.</p>}
        {roots.map((c) => (
          <div key={c.id} style={{ display: "contents" }}>
            {render(c, false)}
            {(byParent.get(c.id) ?? []).map((r) => render(r, true))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommentSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (body: string) => Promise<void> }) {
  useBackClose(open, onClose);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => ref.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  async function submit() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try { await onSubmit(body); setText(""); onClose(); }
    catch (e) { fail("Não foi possível publicar")(e); }
    finally { setBusy(false); }
  }

  return (
    <div className={`d2-modal cm-sheet ${open ? "show" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="d2-modal-box" role="dialog" aria-modal="true" aria-label="Comentar">
        <div className="d2-modal-head">
          <div><h2>Comentar</h2><small>O que você achou?</small></div>
          <button type="button" className="d2-modal-close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        <textarea ref={ref} className="cm-input" placeholder="Escreva seu comentário…" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="cm-foot">
          <span className="cm-count">{text.length}/500</span>
          <BusyButton type="button" className="action-btn play cm-submit" loading={busy} disabled={!text.trim()} onClick={() => void submit()}>Publicar</BusyButton>
        </div>
      </div>
    </div>
  );
}
