import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { SocAvatar } from "@/components/social/SocUi";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { useNotificationFeed } from "@/hooks/useNotificationFeed";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { openExternal } from "@/lib/native";
import { VerifiedBadge } from "@/components/VerifiedName";
import { timeAgo } from "@/lib/social";
import type { StoredNotif } from "@/lib/notifHistory";
import { markFriendNotificationsRead, respondToRequest } from "@/services/friends";
import { posterUrl } from "@/services/tmdb";

const DAY = 86_400_000;

function bucket(ts: number) {
  const age = Date.now() - ts;
  if (age < DAY) return "Hoje";
  if (age < 7 * DAY) return "Esta semana";
  return "Mais antigas";
}

/** Destaca o nome da pessoa dentro do texto. */
function NotifText({ n }: { n: StoredNotif }) {
  const name = n.from?.name;
  const i = name ? n.text.indexOf(name) : -1;
  if (!name || i < 0) return <>{n.text}</>;
  return <>{n.text.slice(0, i)}<b>{name}</b>{n.text.slice(i + name.length)}</>;
}

function Lead({ n }: { n: StoredNotif }) {
  if (n.from) return <SocAvatar name={n.from.name} avatar={n.from.avatar} color={n.from.color} />;
  return (
    <span className="nt-poster">
      <img src={posterUrl(n.poster ?? null, "w92")} alt="" loading="lazy"
        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
      <i className="nt-kind"><Icon name={n.kind === "stalled" ? "play" : "film"} size={12} strokeWidth={2.4} /></i>
    </span>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();
  const { enabled } = useSocial();
  const pid = activeProfile!.id;
  const feed = useNotificationFeed();
  const ann = useAnnouncements();
  const seenAtOpen = useRef(ann.seen);              // o ponto de "novo" fica enquanto a tela estiver aberta
  const annLeave = useRef<() => void>(() => {});
  annLeave.current = ann.markAllSeen;
  useEffect(() => () => annLeave.current(), []);
  const [busyKey, setBusyKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ao sair da tela, o que estava em "Novas" passa a ser "Anteriores"
  const leave = useRef<() => void>(() => {});
  leave.current = () => {
    feed.markAllRead();
    void qc.invalidateQueries({ queryKey: ["friendNotifs", pid] });
  };
  useEffect(() => () => leave.current(), []);

  // avisos de "aceitou seu pedido" são marcados como lidos no servidor quando a pessoa abre a tela
  const markedServer = useRef(false);
  useEffect(() => {
    if (markedServer.current || !enabled) return;
    if (feed.fresh.some((n) => n.kind === "friend_accepted")) {
      markedServer.current = true;
      markFriendNotificationsRead(pid).catch(() => {});
    }
  }, [feed.fresh, enabled, pid]);

  const respond = useMutation({
    mutationFn: ({ n, accept }: { n: StoredNotif; accept: boolean }) => respondToRequest(pid, n.friendshipId!, accept),
    onMutate: ({ n }) => { setBusyKey(n.key); setErrors((e) => ({ ...e, [n.key]: "" })); },
    onSuccess: (_d, { n, accept }) => {
      const name = n.from?.name ?? "essa pessoa";
      feed.resolve(n.key, accept ? `Você e ${name} agora são amigos.` : `Você recusou o pedido de ${name}.`);
      void qc.invalidateQueries({ queryKey: ["friendships", pid] });
    },
    onError: (e, { n }) => setErrors((x) => ({ ...x, [n.key]: e instanceof Error ? e.message : "Não foi possível agora." })),
    onSettled: () => setBusyKey(""),
  });

  const open = (n: StoredNotif) => {
    if (n.mediaId && n.mediaType) navigate(`/details?id=${n.mediaId}&type=${n.mediaType}`);
    else if (n.kind === "friend_accepted" && n.friendshipId) navigate(`/mensagens?chat=${n.friendshipId}`);
    else navigate("/amigos");
  };

  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/home", { replace: true }));
  const nothing = !feed.fresh.length && !feed.older.length && !ann.items.length;

  const renderItem = (n: StoredNotif, isFresh: boolean) => {
    const isRequest = isFresh && n.kind === "friend_request";
    return (
      <li key={n.key} className={`nt-item${isFresh ? " fresh" : ""}`}>
        <button type="button" className="nt-main" onClick={() => !isRequest && open(n)} aria-label={n.text}>
          <Lead n={n} />
          <span className="nt-body">
            <span className="nt-text"><NotifText n={n} /></span>
            <small>{timeAgo(new Date(n.ts).toISOString())}</small>
          </span>
          {isFresh && !isRequest && <i className="nt-dot" aria-hidden="true" />}
        </button>
        {isRequest && (
          <div className="nt-actions">
            <button type="button" className="nt-btn primary" disabled={busyKey === n.key} onClick={() => respond.mutate({ n, accept: true })}>Aceitar</button>
            <button type="button" className="nt-btn" disabled={busyKey === n.key} onClick={() => respond.mutate({ n, accept: false })}>Recusar</button>
            {errors[n.key] && <small className="nt-error">{errors[n.key]}</small>}
          </div>
        )}
      </li>
    );
  };

  let lastBucket = "";

  return (
    <div className="nt-screen">
      <header className="nt-head">
        <button type="button" className="nt-back" aria-label="Voltar" onClick={back}><Icon name="arrowLeft" /></button>
        <h1>Notificações</h1>
        {feed.fresh.some((n) => n.kind !== "friend_request") && (
          <button type="button" className="nt-readall" onClick={feed.markAllRead}>Marcar como lidas</button>
        )}
      </header>

      <div className="nt-scroll">
        {feed.loading && nothing && (
          <ul className="nt-list" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <li key={i} className="nt-item"><div className="nt-main nt-skel"><i /><span><b /><b /></span></div></li>)}
          </ul>
        )}

        {!feed.loading && nothing && (
          <div className="nt-empty">
            <span className="nt-empty-ico"><Icon name="bell" size={38} strokeWidth={1.8} /></span>
            <h2>Nenhuma notificação ainda</h2>
            <p>Pedidos de amizade, filmes novos das suas sequências e o lembrete do que você parou de assistir aparecem aqui.</p>
          </div>
        )}

        {!!ann.items.length && (
          <section>
            <h2 className="nt-section">Avisos</h2>
            <ul className="nt-list">
              {ann.items.map((a) => {
                const isNew = a.id > seenAtOpen.current;
                return (
                  <li key={a.id} className={`nt-item${isNew ? " fresh" : ""}`}>
                    <button type="button" className="nt-main" onClick={() => a.url && void openExternal(a.url)}>
                      <span className="nt-poster ann-lead"><Icon name="megaphone" size={20} strokeWidth={2.2} /></span>
                      <span className="nt-body">
                        <span className="nt-text">{a.author_label && <span className="ann-author-line">{a.author_label}<VerifiedBadge /></span>}<b>{a.title}</b><br />{a.body}</span>
                        <small>{timeAgo(a.created_at)}</small>
                      </span>
                      {isNew && <i className="nt-dot" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!!feed.fresh.length && (
          <section>
            <h2 className="nt-section">Novas <span className="nt-count">{feed.fresh.length}</span></h2>
            <ul className="nt-list">{feed.fresh.map((n) => renderItem(n, true))}</ul>
          </section>
        )}

        {!feed.fresh.length && !nothing && (
          <div className="nt-uptodate"><Icon name="check" size={18} strokeWidth={2.6} /> Você está em dia</div>
        )}

        {!!feed.older.length && (
          <section>
            <h2 className="nt-section">Anteriores</h2>
            <ul className="nt-list">
              {feed.older.map((n) => {
                const b = bucket(n.ts);
                const head = b !== lastBucket ? <li key={`b-${b}`} className="nt-bucket">{b}</li> : null;
                lastBucket = b;
                return <Fragment key={n.key}>{head}{renderItem(n, false)}</Fragment>;
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
