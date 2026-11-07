import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChannelPlayer } from "@/components/channels/ChannelPlayer";
import { ChannelsBrowser } from "@/components/channels/ChannelsBrowser";
import { useProfile } from "./ProfileContext";
import type { Channel } from "@/services/channels";
import { useBackClose } from "@/hooks/useBackClose";

interface Value { openPlayer: (channel: Channel, list?: Channel[]) => void; openPanel: () => void; closePanel: () => void }
const Ctx = createContext<Value | null>(null);

/** Player de canal e painel "Canais ao vivo" disponíveis em qualquer tela. */
export function ChannelsUiProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const [player, setPlayer] = useState<{ list: Channel[]; index: number } | null>(null);
  const [panel, setPanel] = useState(false);
  useBackClose(panel && !player, () => setPanel(false));

  const openPlayer = useCallback((channel: Channel, list: Channel[] = [channel]) => {
    setPlayer({ list, index: Math.max(0, list.findIndex((c) => c.stream === channel.stream)) });
  }, []);
  const openPanel = useCallback(() => setPanel(true), []);
  const closePanel = useCallback(() => setPanel(false), []);
  const value = useMemo(() => ({ openPlayer, openPanel, closePanel }), [openPlayer, openPanel, closePanel]);

  // Sem perfil escolhido, nada de canais (favoritos dependem do perfil)
  useEffect(() => { if (!activeProfile) { setPlayer(null); setPanel(false); } }, [activeProfile]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {activeProfile && panel && (
        <div className="cpx" role="dialog" aria-modal="true" aria-label="Canais ao vivo">
          <ChannelsBrowser onClose={() => setPanel(false)} />
        </div>
      )}
      {activeProfile && player && (
        <ChannelPlayer list={player.list} index={player.index} onIndex={(i) => setPlayer((p) => (p ? { ...p, index: i } : p))} onClose={() => setPlayer(null)} />
      )}
    </Ctx.Provider>
  );
}

export function useChannelsUi() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChannelsUi deve ser usado dentro de <ChannelsUiProvider>");
  return c;
}
