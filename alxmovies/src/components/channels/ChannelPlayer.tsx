import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChannelFavorites } from "@/hooks/useChannelFavorites";
import { enterFullscreenLandscape } from "@/lib/media";
import { channelGroupLabel, getChannelProgramGuide, type Channel, type ProgramInfo } from "@/services/channels";
import { isNative, shareLink } from "@/lib/native";
import { useBackClose } from "@/hooks/useBackClose";
import { useImmersiveLandscape } from "@/hooks/useImmersiveLandscape";
import { useWakeLock } from "@/hooks/useWakeLock";

const clock = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
function Program({ tag, p }: { tag: string; p: ProgramInfo }) {
  const a = clock(p.inicio), b = clock(p.fim);
  return <div className={tag === "AGORA" ? "epg-now" : "epg-next"}><span className="epg-tag">{tag}</span> {p.titulo}{a && b && <span className="epg-time"> ({a}–{b})</span>}</div>;
}

interface Props { list: Channel[]; index: number; onIndex: (i: number) => void; onClose: () => void }

export function ChannelPlayer({ list, index, onIndex, onClose }: Props) {
  const channel = list[index];
  const { isFavorite, toggle, busy } = useChannelFavorites();
  const frameWrap = useRef<HTMLDivElement>(null);
  useImmersiveLandscape(true);
  useWakeLock(true);
  useBackClose(true, onClose);
  const [shared, setShared] = useState(false);
  const guide = useQuery({ queryKey: ["epg", channel?.stream], queryFn: () => getChannelProgramGuide(channel.stream), enabled: !!channel, staleTime: 60_000 });

  // Entra em tela cheia/paisagem ao abrir e a cada troca de canal (o clique que abriu conta como gesto)
  useEffect(() => { if (!isNative && channel && frameWrap.current) enterFullscreenLandscape(frameWrap.current); }, [channel?.stream]);
  useEffect(() => () => { if (document.fullscreenElement) void document.exitFullscreen?.(); }, []);

  if (!channel) return null;
  const g = guide.data;
  const fav = isFavorite(channel.stream);

  async function share() {
    const url = `${window.location.origin}/home?openChannel=${encodeURIComponent(channel.stream)}`;
    const r = await shareLink({ title: `${channel.name} — ALXmovies`, url });
    if (r === "copied") { setShared(true); setTimeout(() => setShared(false), 2000); }
  }

  return (
    <div className="channel-player-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="channel-player-box">
        <div className="channel-player-topbar">
          <div className="channel-player-info">
            <img className="channel-player-logo" alt="" src={channel.logo || "/assets/no-poster.png"} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
            <div>
              <div className="channel-player-name">{channel.name || "Canal"}</div>
              <div className="channel-player-group">{channelGroupLabel(channel.group)}</div>
            </div>
          </div>
          <div className="channel-player-actions">
            <button type="button" className={`channel-fav-btn${fav ? " active" : ""}`} disabled={busy} aria-label="Favoritar" onClick={() => toggle(channel)}>{fav ? "♥" : "♡"}</button>
            <button type="button" className="channel-fav-btn" aria-label="Compartilhar" onClick={() => void share()}>{shared ? "✅" : "🔗"}</button>
            <button type="button" className="trailer-close-btn" aria-label="Fechar" onClick={onClose}>✕</button>
          </div>
        </div>

        {g && (g.atual || g.proximo) && (
          <div className="channel-player-epg" style={{ display: "block" }}>
            {g.atual && <Program tag="AGORA" p={g.atual} />}
            {g.proximo && <Program tag="A SEGUIR" p={g.proximo} />}
          </div>
        )}

        <div className="channel-player-frame-wrap" ref={frameWrap}>
          <iframe key={channel.stream} src={channel.stream} className="trailer-iframe" title={channel.name || "Canal"}
            allow="autoplay; fullscreen; encrypted-media" allowFullScreen referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" />
        </div>

        <div className="channel-player-controls">
          <button type="button" className="account-btn secondary" onClick={() => onIndex((index - 1 + list.length) % list.length)}>◀ Anterior</button>
          <span className="channel-player-position">{index + 1} / {list.length}</span>
          <button type="button" className="account-btn secondary" onClick={() => onIndex((index + 1) % list.length)}>Próximo ▶</button>
        </div>
      </div>
    </div>
  );
}
