import { useEffect, useState } from "react";
import { PlayerLoading } from "@/components/player/PlayerLoading";
import { useBackClose } from "@/hooks/useBackClose";
import { useImmersiveLandscape } from "@/hooks/useImmersiveLandscape";
import { isNative } from "@/lib/native";
import { NativePlayer } from "@/lib/nativePlayer";
import { channelGroupLabel, getChannelProgramGuide, setChannelStatus, type Channel } from "@/services/channels";

interface Props { list: Channel[]; index: number; onIndex: (i: number) => void; onClose: () => void }

/**
 * Player de canais: SOMENTE o player nativo (ExoPlayer/Media3), o mesmo dos filmes em modo ao vivo.
 * O programa atual chega depois, sem atrasar o vídeo. Se o canal tocar, fica marcado "no ar"; se falhar, "fora do ar".
 */
export function ChannelPlayer({ list, index, onIndex, onClose }: Props) {
  const channel = list[index];
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useImmersiveLandscape(true);
  useBackClose(true, onClose);

  useEffect(() => {
    if (!channel || !isNative) return;
    let cancelled = false;
    let timer: number | undefined;
    const group = channelGroupLabel(channel.group);
    setError("");

    // programação em segundo plano (não segura o vídeo); atualiza a cada minuto enquanto o canal toca
    const pushGuide = async () => {
      const g = await getChannelProgramGuide(channel.stream);
      if (cancelled) return;
      void NativePlayer.setSubtitle({ text: g?.atual?.titulo ?? (group || "Sem informação de programação") }).catch(() => {});
    };
    void pushGuide();
    timer = window.setInterval(() => void pushGuide(), 60_000);

    const many = list.length > 1;
    void NativePlayer.play({
      url: channel.stream, title: channel.name || "Canal", subtitle: group, logo: channel.logo ?? "",
      live: true, hasNext: many, hasPrev: many, server: "", source: "main", fallbackLabel: "", servers: [], rate: 1,
    }).then((res) => {
      if (cancelled) return;
      if (res.played) setChannelStatus(channel.stream, true, "No ar");
      else if (res.reason === "error") setChannelStatus(channel.stream, false, "Não abriu no player");
      if (res.reason === "next") onIndex((index + 1) % list.length);
      else if (res.reason === "prev") onIndex((index - 1 + list.length) % list.length);
      else if (res.reason === "closed") onClose();
      else setError("Não foi possível reproduzir este canal agora. Ele pode estar fora do ar.");
    }).catch(() => { if (!cancelled) setError("O player nativo não está disponível neste aparelho."); });

    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.stream, attempt]);

  if (!channel) return null;
  const name = channel.name || "Canal";

  return (
    <div className="cpl">
      {isNative ? (
        <PlayerLoading title={name} subtitle={channelGroupLabel(channel.group) || "Ao vivo"} poster={channel.logo ?? undefined} text="Abrindo o canal…" />
      ) : null}

      {(!isNative || error) && (
        <div className="cpl-err" role="alert">
          <span>{isNative ? "⚠️" : "📱"}</span>
          <h2>{isNative ? "Canal indisponível" : "Canais só no aplicativo"}</h2>
          <p>{isNative ? error : "Os canais ao vivo tocam no app do ALXmovies para Android, com o player nativo."}</p>
          {isNative && <button type="button" className="dv-btn dv-primary" onClick={() => setAttempt((n) => n + 1)}>Tentar de novo</button>}
          <div className="dv-row">
            {isNative && list.length > 1 && <button type="button" className="dv-btn" onClick={() => onIndex((index + 1) % list.length)}>Próximo canal</button>}
            <button type="button" className="dv-btn" onClick={onClose}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
