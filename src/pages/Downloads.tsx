import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";
import { useDownloads } from "@/context/DownloadsContext";
import {
  fmtBytes, fmtDuration, fmtEta, fmtSpeed, getQuality, posterSrc, QUALITIES, setQuality, SPEEDS, type DlItem, type Quality,
} from "@/lib/downloads";

function statusLine(it: DlItem): string {
  const pct = Math.round(it.progress * 100);
  const size = it.estTotal > 0 ? `${fmtBytes(it.bytes)} de ~${fmtBytes(it.estTotal)}` : fmtBytes(it.bytes);
  switch (it.status) {
    case "downloading": {
      const left = it.estTotal > it.bytes && it.speed > 0 ? fmtEta((it.estTotal - it.bytes) / it.speed) : "";
      return [`${pct}%`, size, fmtSpeed(it.speed), left && `faltam ${left}`].filter(Boolean).join(" · ");
    }
    case "queued": return it.waitingWifi ? "Aguardando Wi-Fi" : "Na fila";
    case "paused": return `Pausado · ${pct}% · ${fmtBytes(it.bytes)}`;
    case "error": return it.error || "Não foi possível baixar.";
    default: return "";
  }
}

function Poster({ it }: { it: DlItem }) {
  const src = posterSrc(it);
  return src
    ? <img className="dlp-poster" src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/no-poster.png"; }} />
    : <span className="dlp-poster dlp-poster-ph"><Icon name="film" size={22} /></span>;
}

export default function DownloadsPage() {
  const d = useDownloads();
  const [quality, setQ] = useState<Quality>(getQuality());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => { d.refreshStorage(); }, [d.refreshStorage]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 5000); return () => clearTimeout(t); }, [note]);

  const { running, done } = useMemo(() => ({
    running: d.items.filter((i) => i.status !== "done"),
    done: d.items.filter((i) => i.status === "done").sort((a, b) => b.finishedAt - a.finishedAt),
  }), [d.items]);

  const speed = running.reduce((s, i) => s + (i.status === "downloading" ? i.speed : 0), 0);
  const doneBytes = done.reduce((s, i) => s + i.bytes, 0);
  const st = d.storage;
  const used = st?.downloadsBytes ?? 0;
  const pct = st && st.totalBytes > 0 ? Math.min(100, (used / st.totalBytes) * 100) : 0;
  const anyActive = running.some((i) => i.status === "downloading" || i.status === "queued");
  const anyPaused = running.some((i) => i.status === "paused" || i.status === "error");

  async function askRemove(id: string) {
    if (confirm !== id) { setConfirm(id); setTimeout(() => setConfirm((c) => (c === id ? null : c)), 4000); return; }
    setConfirm(null);
    await d.remove(id);
  }
  async function doExport(it: DlItem) {
    setExporting(it.id); setNote("");
    try { const p = await d.exportFile(it.id); setNote(`Salvo em ${p}`); }
    catch (e) { setNote(e instanceof Error && e.message ? e.message : "Não foi possível salvar o arquivo."); }
    setExporting(null);
  }
  async function doPlay(it: DlItem) {
    setPlaying(it.id);
    try { await d.play(it); } catch { setNote("Não foi possível abrir o vídeo. Os arquivos podem ter sido apagados."); }
    setPlaying(null);
  }

  return (
    <main className="dlp">
      <header className="dlp-head">
        <h1>Downloads</h1>
        {(anyActive || anyPaused) && (
          <button type="button" className="dlp-link" onClick={() => (anyActive ? d.pauseAll() : d.resumeAll())}>
            {anyActive ? "Pausar tudo" : "Retomar tudo"}
          </button>
        )}
      </header>

      <section className="dlp-storage" aria-label="Armazenamento">
        <div className="dlp-st-top">
          <div><small>Usado pelos downloads</small><b>{fmtBytes(used)}</b></div>
          <div className="dlp-st-r"><small>Livre no celular</small><b>{st ? fmtBytes(st.freeBytes) : "—"}</b></div>
        </div>
        <div className="dlp-bar" aria-hidden><i style={{ width: `${Math.max(pct, used > 0 ? 1.5 : 0)}%` }} /></div>
        <div className="dlp-st-foot">
          <span>{done.length} {done.length === 1 ? "vídeo salvo" : "vídeos salvos"}{done.length > 0 ? ` · ${fmtBytes(doneBytes)}` : ""}</span>
          {speed > 0 && <span>{fmtSpeed(speed)}</span>}
        </div>
      </section>

      <section className="dlp-opts">
        <label className="dlp-switch">
          <span><b>Só no Wi-Fi</b><small>Não gasta seu pacote de dados</small></span>
          <input type="checkbox" checked={d.wifiOnly} onChange={(e) => d.setWifiOnly(e.target.checked)} />
          <i aria-hidden />
        </label>
        <div className="dlp-q">
          <span>Velocidade do download</span>
          <div className="dl-chips">
            {SPEEDS.map((x) => (
              <button key={x.v} type="button" className={`dl-chip${d.speed === x.v ? " on" : ""}`} onClick={() => d.setSpeed(x.v)}>{x.label}</button>
            ))}
          </div>
          <small className="dlp-hint">“Máximo” usa várias conexões ao mesmo tempo para baixar o mais rápido possível. Se o servidor reclamar, o app diminui o ritmo sozinho.</small>
        </div>
        <div className="dlp-q">
          <span>Qualidade dos próximos downloads</span>
          <div className="dl-chips">
            {QUALITIES.map((q) => (
              <button key={q.v} type="button" className={`dl-chip${quality === q.v ? " on" : ""}`}
                onClick={() => { setQ(q.v); setQuality(q.v); }}>{q.label}</button>
            ))}
          </div>
        </div>
      </section>

      {note && <p className="dlp-note" role="status">{note}</p>}

      {d.items.length === 0 && (
        <div className="dlp-empty">
          <Icon name="download" size={40} />
          <b>Nenhum download ainda</b>
          <p>Abra um filme ou episódio e toque em <b>Baixar</b>. Os vídeos ficam aqui e tocam sem internet.</p>
        </div>
      )}

      {running.length > 0 && (
        <section>
          <h2 className="dlp-sec">Em andamento</h2>
          <div className="dlp-list">
            {running.map((it) => (
              <article key={it.id} className={`dlp-card st-${it.status}`}>
                <Poster it={it} />
                <div className="dlp-body">
                  <b className="dlp-title">{it.title}</b>
                  <div className="dlp-prog" aria-hidden><i style={{ width: `${Math.round(it.progress * 100)}%` }} className={it.status === "error" ? "err" : ""} /></div>
                  <small className={it.status === "error" ? "dlp-err" : ""}>{statusLine(it)}</small>
                </div>
                <div className="dlp-act">
                  {it.status === "downloading" && <button type="button" aria-label="Pausar" onClick={() => d.pause(it.id)}><Icon name="pause" size={20} /></button>}
                  {it.status === "queued" && <button type="button" aria-label="Pausar" onClick={() => d.pause(it.id)}><Spinner size={16} /></button>}
                  {(it.status === "paused" || it.status === "error") && <button type="button" aria-label="Retomar" onClick={() => void d.resume(it)}><Icon name={it.status === "error" ? "refresh" : "play"} size={20} /></button>}
                  <button type="button" className={confirm === it.id ? "danger on" : "danger"} aria-label="Cancelar download" onClick={() => void askRemove(it.id)}>
                    {confirm === it.id ? <small>Apagar?</small> : <Icon name="trash" size={19} />}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <div className="dlp-sec-row">
            <h2 className="dlp-sec">Concluídos</h2>
            <button type="button" className="dlp-link danger" onClick={() => {
              if (confirm !== "__all__") { setConfirm("__all__"); setTimeout(() => setConfirm((c) => (c === "__all__" ? null : c)), 4000); return; }
              setConfirm(null); void d.removeCompleted();
            }}>{confirm === "__all__" ? "Toque de novo para apagar tudo" : "Apagar todos"}</button>
          </div>
          <div className="dlp-list">
            {done.map((it) => (
              <article key={it.id} className="dlp-card st-done">
                <button type="button" className="dlp-playbox" onClick={() => void doPlay(it)} aria-label={`Assistir ${it.title}`}>
                  <Poster it={it} />
                  <span className="dlp-play">{playing === it.id ? <Spinner size={18} /> : <Icon name="play" size={20} />}</span>
                </button>
                <div className="dlp-body">
                  <b className="dlp-title">{it.title}</b>
                  <small>{[fmtBytes(it.bytes), fmtDuration(it.durationSec), it.ext.toUpperCase()].filter(Boolean).join(" · ")}</small>
                  <div className="dlp-btns">
                    <button type="button" onClick={() => void doPlay(it)}>Assistir</button>
                    {it.exportable && <button type="button" disabled={exporting === it.id} onClick={() => void doExport(it)}>{exporting === it.id ? "Salvando…" : `Salvar .${it.ext}`}</button>}
                  </div>
                </div>
                <div className="dlp-act">
                  <button type="button" className={confirm === it.id ? "danger on" : "danger"} aria-label="Apagar" onClick={() => void askRemove(it.id)}>
                    {confirm === it.id ? <small>Apagar?</small> : <Icon name="trash" size={19} />}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <p className="dlp-tip">Dica: “Salvar .ts” junta tudo em um arquivo na pasta Downloads/ALXmovies do celular, para abrir em outro player.</p>
    </main>
  );
}
