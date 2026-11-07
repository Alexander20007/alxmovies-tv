import { useState } from "react";
import { Icon } from "@/components/Icon";

interface Props {
  title: string;
  subtitle?: string;
  poster?: string;
  servers: { label: string; ok: boolean }[];
  /** servidor que o modo Automático já deixou pronto */
  autoServer: string;
  /** último servidor que a pessoa escolheu (fica marcado) */
  last: string;
  /** null = voltar; "__auto__" = Automático; senão o nome do servidor */
  onChoose: (choice: string | null, dontAskAgain: boolean) => void;
}

/** Tela antes do vídeo: a pessoa escolhe o servidor. O link do Automático já está pronto, então começa na hora. */
export function ServerPicker({ title, subtitle, poster, servers, autoServer, last, onChoose }: Props) {
  const [skip, setSkip] = useState(false);
  return (
    <div className="wl sp" role="dialog" aria-label="Escolha o servidor">
      {poster && <img className="wl-bg" src={poster} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      <div className="wl-shade" />
      <button type="button" className="sp-back" aria-label="Voltar" onClick={() => onChoose(null, false)}><Icon name="arrowLeft" size={24} /></button>
      <div className="sp-body">
        <span className="wl-brand">ALXmovies</span>
        <h1 className="wl-title">{title}</h1>
        {subtitle ? <p className="wl-sub">{subtitle}</p> : null}
        <p className="sp-ask">Escolha o servidor</p>

        <div className="sp-list">
          <button type="button" className="sp-opt auto" onClick={() => onChoose("__auto__", skip)}>
            <span className="sp-ico"><Icon name="play" size={20} /></span>
            <span className="sp-txt"><b>Automático</b><small>Recomendado · começa agora ({autoServer})</small></span>
          </button>
          {servers.map((s) => (
            <button key={s.label} type="button" className="sp-opt" disabled={!s.ok} onClick={() => onChoose(s.label, skip)}>
              <span className="sp-ico"><Icon name="server" size={20} /></span>
              <span className="sp-txt">
                <b>{s.label}</b>
                <small>{!s.ok ? "Indisponível agora" : s.label === last ? "Último usado" : s.label === autoServer ? "Já carregado" : "Toque para usar"}</small>
              </span>
            </button>
          ))}
        </div>

        <label className="sp-skip">
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          <span>Não mostrar esta tela de novo (usar sempre o Automático)</span>
        </label>
      </div>
    </div>
  );
}
