import { useEffect, useMemo, useState } from "react";
import { shareLink } from "@/lib/native";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ImmersivePage, SubEmpty, SubSkeleton } from "@/components/ImmersivePage";
import { ChannelCard } from "@/components/channels/ChannelCard";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";
import { useChannelsUi } from "@/context/ChannelsUiContext";
import { useChannelFavorites } from "@/hooks/useChannelFavorites";
import {
  channelGroupLabel, fetchAllChannels, findChannelByName, isHlsUrl, findChannelByStream, getChannelProgramGuide, getChannelStatus, guessCategoryIcon, recheckChannel,
  type Channel, type ProgramInfo,
} from "@/services/channels";

const clock = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const progressOf = (p: ProgramInfo | null) => {
  if (!p?.inicio || !p.fim) return null;
  const a = new Date(p.inicio).getTime(), b = new Date(p.fim).getTime(), n = Date.now();
  return b > a ? Math.max(0, Math.min(100, ((n - a) / (b - a)) * 100)) : null;
};
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "agora há pouco" : m === 1 ? "há 1 minuto" : `há ${m} minutos`; };

/** Página do canal: status, programação (agora/a seguir), favoritar e outros canais da mesma categoria. */
export default function Canal() {
  const [params] = useSearchParams();
  const sParam = params.get("s") ?? "";
  const nParam = params.get("n") ?? ""; // link compartilhado: pelo nome (não expõe o endereço do vídeo)
  const location = useLocation();
  const navigate = useNavigate();
  const { openPlayer } = useChannelsUi();
  const { isFavorite, toggle, busy } = useChannelFavorites();
  const fromState = (location.state as { channel?: Channel } | null)?.channel;

  const ch = useQuery({
    queryKey: ["canal", sParam, nParam],
    queryFn: async () => (fromState && sParam && fromState.stream === sParam ? fromState : sParam ? await findChannelByStream(sParam) : nParam ? await findChannelByName(nParam) : null),
    enabled: !!(sParam || nParam),
  });
  const channel = ch.data ?? null;
  const stream = channel?.stream ?? sParam;

  // status: usa o último teste (até 10 min); senão testa agora
  const [status, setStatus] = useState<{ online: boolean; testedAt: number } | null>(() => (stream ? getChannelStatus(stream) : null));
  const [testing, setTesting] = useState(false);
  const retest = async () => {
    if (!stream || testing) return;
    setTesting(true);
    const online = await recheckChannel(stream);
    setStatus({ online, testedAt: Date.now() });
    setTesting(false);
  };
  useEffect(() => {
    const known = stream ? getChannelStatus(stream) : null;
    setStatus(known);
    if (stream && !known) void retest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  const epg = useQuery({ queryKey: ["epg", stream], queryFn: () => getChannelProgramGuide(stream), enabled: !!stream, staleTime: 60_000, refetchInterval: 60_000 });

  const all = useQuery({ queryKey: ["allChannels"], queryFn: fetchAllChannels, staleTime: 10 * 60_000 });
  const similar = useMemo(() => {
    if (!channel) return [] as Channel[];
    const list = (all.data ?? []).filter((c) => c.stream && c.stream !== channel.stream && (c.group || "") === (channel.group || ""));
    const known = (c: Channel) => getChannelStatus(c.stream)?.online;
    return [...list].sort((a, b) => Number(known(b) === true) - Number(known(a) === true)).slice(0, 24);
  }, [all.data, channel]);

  const [copied, setCopied] = useState(false);
  async function share() {
    if (!channel) return;
    const url = `${window.location.origin}/canal?n=${encodeURIComponent(channel.name || "")}`;
    const r = await shareLink({ title: `${channel.name} — ALXmovies`, text: `Assista ${channel.name} ao vivo no ALXmovies`, url });
    if (r === "copied") { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }
  const goBack = () => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate("/home", { replace: true }); };

  if (!sParam && !nParam) return <ImmersivePage back="/home"><SubEmpty title="Canal inválido" text="Não encontramos este canal." to="/home" /></ImmersivePage>;
  if (ch.isLoading) return <ImmersivePage back="/home"><SubSkeleton /></ImmersivePage>;
  if (!channel) return <ImmersivePage back="/home"><SubEmpty title="Canal não encontrado" text="Ele pode ter saído da lista." to="/home" label="Voltar ao início" /></ImmersivePage>;

  const name = channel.name || "Canal";
  const group = channelGroupLabel(channel.group);
  const online = status?.online ?? null;
  const fav = isFavorite(channel.stream);
  const atual = epg.data?.atual ?? null, proximo = epg.data?.proximo ?? null;
  const pct = progressOf(atual);
  const watch = () => openPlayer(channel, [channel, ...similar.filter((c) => getChannelStatus(c.stream)?.online === true)]);
  document.title = `${name} | ALXmovies`;

  return (
    <ImmersivePage back="/home" id="canal-page" bar={false}>
      <div className="dv cn">
        <header className="cn-hero">
          <div className="dv-bg">{channel.logo && <img src={channel.logo} alt="" />}</div>
          <div className="dv-top">
            <button type="button" className="dv-round" aria-label="Voltar" onClick={goBack}><Icon name="arrowLeft" size={22} strokeWidth={2.4} /></button>
            <span className="dv-top-sp" />
            <button type="button" className={`dv-round dv-heart${fav ? " on" : ""}`} disabled={busy} aria-label={fav ? "Remover dos favoritos" : "Favoritar canal"} onClick={() => toggle(channel)}>
              <Icon name="heart" size={22} fill={fav ? "currentColor" : "none"} />
            </button>
          </div>
          <div className="cn-logo">
            {channel.logo ? <img src={channel.logo} alt={name} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <span className="cc-emoji big">{guessCategoryIcon(name)}</span>}
            <span className={`cc-badge lg ${online === true ? "on" : online === false ? "off" : "unk"}`}>
              <i />{testing && online === null ? "VERIFICANDO…" : online === true ? "AO VIVO" : online === false ? "OFFLINE" : "—"}
            </span>
          </div>
        </header>

        <h1 className="dv-title">{name}</h1>
        <div className="dv-meta">
          <span>{guessCategoryIcon(name)} {group || "Canal de TV"}</span>
          <span>TV ao vivo</span>
        </div>

        <div className="dv-actions">
          <button type="button" className={`dv-btn dv-primary${online === false ? " cn-dim" : ""}`} onClick={watch}>
            <Icon name="play" size={22} />{online === false ? "Tentar assistir mesmo assim" : "Assistir ao vivo"}
          </button>
          <div className="dv-row">
            <button type="button" className={`dv-btn${fav ? " rated" : ""}`} disabled={busy} onClick={() => toggle(channel)}>
              <Icon name="heart" size={20} fill={fav ? "currentColor" : "none"} /><span>{fav ? "Nos favoritos" : "Favoritar"}</span>
            </button>
            <button type="button" className="dv-btn" onClick={() => void share()}>
              <Icon name="share" size={20} /><span>{copied ? "Link copiado!" : "Compartilhar"}</span>
            </button>
          </div>
          <button type="button" className="dv-btn" disabled={testing} onClick={() => void retest()}>
            {testing ? <Spinner size={18} /> : <Icon name="sort" size={20} />}<span>{testing ? "Verificando…" : "Verificar sinal agora"}</span>
          </button>
        </div>

        <section className="dv-card cn-epg">
          <h3>Programação</h3>
          {epg.isLoading ? <p className="cn-muted"><Spinner size={14} /> Buscando a programação…</p>
            : atual ? (<>
              <div className="cn-now">
                <small><span className="cn-live"><i />AGORA</span>{clock(atual.inicio) && clock(atual.fim) ? ` · ${clock(atual.inicio)}–${clock(atual.fim)}` : ""}</small>
                <b>{atual.titulo}</b>
                {pct !== null && <div className="cn-bar"><i style={{ width: `${pct}%` }} /></div>}
              </div>
              {proximo && (
                <div className="cn-next">
                  <small>A SEGUIR{clock(proximo.inicio) ? ` · ${clock(proximo.inicio)}` : ""}</small>
                  <b>{proximo.titulo}</b>
                </div>
              )}
            </>) : <p className="cn-muted">Guia de programação indisponível para este canal.</p>}
        </section>

        <section className="inf-card cn-info">
          <div className="inf-row"><b>Sinal</b><span className={online === true ? "cn-ok" : online === false ? "cn-bad" : ""}>
            {online === true ? "No ar" : online === false ? `Fora do ar${status?.reason ? ` — ${status.reason}` : ""}` : "Verificando…"}{status ? ` · verificado ${ago(status.testedAt)}` : ""}</span></div>
          <div className="inf-row"><b>Categoria</b><span>{group || "Não informada"}</span></div>
          <div className="inf-row"><b>Transmissão</b><span>{isHlsUrl(channel.stream) ? "Ao vivo · HLS" : "Ao vivo"}</span></div>
        </section>

        {similar.length > 0 && (
          <div className="dv-similar cn-similar">
            <div className="row-title">{group ? `Mais em ${group}` : "Outros canais"}</div>
            <div className="row-track">
              {similar.map((c) => (
                <ChannelCard key={c.stream} channel={c} online={getChannelStatus(c.stream)?.online ?? null}
                  onClick={() => navigate(`/canal?s=${encodeURIComponent(c.stream)}`, { state: { channel: c }, replace: true })} />
              ))}
            </div>
          </div>
        )}
        <p className="inf-tmdb"><Link to="/home" style={{ color: "inherit" }}>Voltar ao início</Link></p>
      </div>
    </ImmersivePage>
  );
}
