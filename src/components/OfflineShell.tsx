import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";

/** Tela do modo offline: aviso no topo + os downloads (que tocam sem internet). */
export function OfflineShell({ children, canReturn, checking, onRetry, onReturn }: {
  children: ReactNode; canReturn: boolean; checking: boolean; onRetry: () => Promise<boolean>; onReturn: () => void;
}) {
  return (
    <div className="off-shell">
      <div className={`off-bar${canReturn ? " back" : ""}`} role="status">
        <span className="off-ico"><Icon name={canReturn ? "check" : "wifiOff"} size={20} strokeWidth={2.4} /></span>
        <div className="off-txt">
          <b>{canReturn ? "A conexão voltou" : "Você está offline"}</b>
          <small>{canReturn ? "Toque para voltar ao ALXmovies." : "Assista aos vídeos que você baixou."}</small>
        </div>
        {canReturn
          ? <button type="button" className="off-btn" onClick={onReturn}>Voltar</button>
          : <button type="button" className="off-btn" disabled={checking} onClick={() => void onRetry()}>{checking ? <Spinner size={14} /> : "Tentar de novo"}</button>}
      </div>
      {children}
    </div>
  );
}
