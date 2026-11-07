import { Spinner } from "@/components/Spinner";

interface Props { title?: string; subtitle?: string; poster?: string; slow?: boolean; text?: string }

/** Tela de carregamento do player: sempre na horizontal (paisagem), com o banner do título ao fundo e uma barra deslizando. */
export function PlayerLoading({ title, subtitle, poster, slow, text }: Props) {
  return (
    <div className="wl" role="status" aria-live="polite">
      {poster && <img className="wl-bg" src={poster} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      <div className="wl-shade" />
      <div className="wl-body">
        <span className="wl-brand">ALXmovies</span>
        {title ? <h1 className="wl-title">{title}</h1> : null}
        {subtitle ? <p className="wl-sub">{subtitle}</p> : null}
        <div className="wl-bar"><i /></div>
        <p className="wl-text"><Spinner size={14} /> {slow ? "Acordando o servidor de vídeo… pode levar até um minuto." : text ?? "Preparando o vídeo…"}</p>
      </div>
    </div>
  );
}
