import { channelGroupLabel, guessCategoryIcon, type Channel } from "@/services/channels";

/** Cartão de canal no mesmo tamanho dos pôsteres de filmes, com selo AO VIVO / OFFLINE sobre a imagem. */
export function ChannelCard({ channel, online, onClick }: { channel: Channel; online: boolean | null; onClick: () => void }) {
  const name = channel.name || "Canal";
  const group = channelGroupLabel(channel.group);
  const status = online === true ? "on" : online === false ? "off" : "unk";
  return (
    <button type="button" className={`cc cc-${status}`} onClick={onClick} aria-label={`${name}, ${online === true ? "no ar" : online === false ? "offline" : "status desconhecido"}`}>
      <span className="cc-plate">
        {channel.logo
          ? <img src={channel.logo} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          : <span className="cc-emoji">{guessCategoryIcon(name)}</span>}
      </span>
      <span className={`cc-badge ${status}`}>
        <i />{online === true ? "AO VIVO" : online === false ? "OFFLINE" : "—"}
      </span>
      <span className="cc-info">
        <b>{name}</b>
        {group && <small>{group}</small>}
      </span>
    </button>
  );
}
