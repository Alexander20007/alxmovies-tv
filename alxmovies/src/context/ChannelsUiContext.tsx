import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChannelPlayer } from "@/components/channels/ChannelPlayer";
import { ChannelsBrowser } from "@/components/channels/ChannelsBrowser";
import { useProfile } from "./ProfileContext";
import type { Channel } from "@/services/channels";
import { useBackClose } from "@/hooks/useBackClose";

interface Value { openPlayer: (channel: Channel, list?: Channel[]) => void; openPanel: () => void }
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
  const value = useMemo(() => ({ openPlayer, openPanel }), [openPlayer, openPanel]);

  // Sem perfil escolhido, nada de canais (favoritos dependem do perfil)
  useEffect(() => { if (!activeProfile) { setPlayer(null); setPanel(false); } }, [activeProfile]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {activeProfile && panel && (
        <div className="channels-panel-overlay" onClick={(e) => e.target === e.currentTarget && setPanel(false)}>
          <div className="channels-panel-box">
            <div className="channels-panel-header">
              <h2>📡 Canais ao vivo</h2>
              <button type="button" id="chp-close" className="trailer-close-btn" aria-label="Fechar" onClick={() => setPanel(false)}>✕</button>
            </div>
            <div className="channels-panel-body"><ChannelsBrowser /></div>
          </div>
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
