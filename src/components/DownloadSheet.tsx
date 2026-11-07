import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAdsEnabled } from "@/hooks/useAdsEnabled";
import { usePlan } from "@/hooks/usePlan";
import { maybeShowInterstitial, showRewardedAd } from "@/lib/ads";
import { consumeDownload, getMyPlan, grantAdBonus, type MyPlan } from "@/services/plans";
import { useBackClose } from "@/hooks/useBackClose";
import { Spinner } from "@/components/Spinner";
import { Icon } from "@/components/Icon";
import { useDownloads } from "@/context/DownloadsContext";
import { fetchStream, resolveStream, type StreamRequest, type StreamResult } from "@/services/stream";
import { cleanFileName, DOWNLOAD_UA } from "@/lib/downloader";
import { Downloads, dlId, fmtBytes, getQuality, QUALITIES, setQuality, type DlMeta, type Quality } from "@/lib/downloads";

export interface DownloadRequest extends StreamRequest { title: string; poster?: string }

const pad = (n?: number) => String(n ?? 0).padStart(2, "0");
/** Nome do arquivo: "Série - T01E03" ou o título do filme. A pessoa não digita nada. */
export const downloadName = (r: DownloadRequest) => (r.type === "tv" && r.season ? `${r.title} - T${pad(r.season)}E${pad(r.episode)}` : r.title);

const AUTO = "__auto__";

/**
 * Folha "Baixar": o link do vídeo é preparado ao abrir; a pessoa escolhe servidor e qualidade e o app baixa sozinho,
 * no gerenciador de downloads interno (aba Downloads).
 */
export function DownloadSheet({ req, onClose }: { req: DownloadRequest | null; onClose: () => void }) {
  useBackClose(!!req, onClose);
  const { items } = useDownloads();
  const [stream, setStream] = useState<StreamResult | null>(null);
  const [server, setServer] = useState<string>(AUTO);
  const [quality, setQ] = useState<Quality>(getQuality());
  const [loadingLink, setLoadingLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [msg, setMsg] = useState("");
  const seq = useRef(0);
  const navigate = useNavigate();
  const adsOn = useAdsEnabled();
  const { refresh: refreshPlan } = usePlan();
  const [limit, setLimit] = useState<MyPlan | null>(null);   // preenchido quando o limite do mês acabou
  const [adBusy, setAdBusy] = useState(false);

  const prepare = useCallback(async (r: DownloadRequest, srv: string) => {
    const my = ++seq.current;
    setLoadingLink(true); setMsg("");
    try {
      const res = srv === AUTO ? await resolveStream(r) : await fetchStream({ ...r, server: srv });
      if (my !== seq.current) return null;
      setStream((old) => (srv === AUTO || !old ? res : { ...res, servers: old.servers.length ? old.servers : res.servers }));
      setLoadingLink(false);
      return res;
    } catch (e) {
      if (my !== seq.current) return null;
      setStream(null); setLoadingLink(false);
      setMsg(e instanceof Error && e.message ? e.message : "Não encontramos o link do vídeo agora. Tente de novo em instantes.");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!req) { seq.current++; return; }
    setMsg(""); setBusy(false); setAdded(false); setStream(null); setServer(AUTO); setLimit(null); setQ(getQuality());
    void prepare(req, AUTO);
  }, [req, prepare]);

  if (!req) return null;
  const name = downloadName(req);
  const sub = req.type === "tv" && req.season ? `${req.title} · T${req.season} E${req.episode}` : req.title;
  const id = dlId(req.type, req.id, req.season, req.episode);
  const existing = items.find((x) => x.id === id);

  /** Garante um link válido (se o da folha expirou ou ainda está carregando, busca de novo). */
  async function ensureLink(): Promise<StreamResult | null> {
    if (stream && !(stream.expiresAt && stream.expiresAt < Date.now() + 30000)) return stream;
    return prepare(req!, server);
  }

  async function start() {
    if (!req || busy) return;
    setBusy(true); setMsg("");
    // limite do plano (vale para a conta toda). Se o servidor não responder, não trava quem está baixando.
    try {
      const p = await getMyPlan();
      if (p && p.remaining <= 0) { setBusy(false); setLimit(p); return; }
    } catch { /* segue */ }
    if (adsOn) await maybeShowInterstitial(0.5);   // plano Grátis: às vezes um anúncio antes de baixar
    const s = await ensureLink();
    if (!s) { setBusy(false); return; }
    try {
      const meta: DlMeta = { type: req.type, id: req.id, season: req.season, episode: req.episode, server: server === AUTO ? undefined : server };
      await Downloads.enqueue({
        id, title: cleanFileName(name), subtitle: sub, poster: req.poster ?? "", meta: JSON.stringify(meta),
        url: s.m3u8, userAgent: DOWNLOAD_UA, maxHeight: quality,
      });
    } catch (e) {
      setBusy(false);
      setMsg(e instanceof Error && e.message && e.message !== "erro" ? e.message : "Não foi possível iniciar o download.");
      return;
    }
    try { await consumeDownload(); } catch { /* ignora: o servidor reconta depois */ }
    refreshPlan();
    setBusy(false); setAdded(true);
  }

  async function watchAd() {
    if (adBusy) return;
    setAdBusy(true); setMsg("");
    const r = await showRewardedAd();
    if (r.completed) {
      try {
        const g = await grantAdBonus();
        if (g.ok) { setLimit(null); refreshPlan(); setMsg("Você ganhou +1 download! Toque em Baixar."); }
        else setMsg(g.error === "daily_cap" ? "Você já ganhou 3 downloads por anúncio hoje. Volte amanhã ou conheça os planos." : "Não foi possível liberar o download agora.");
      } catch { setMsg("Sem conexão. Tente de novo."); }
    } else {
      setMsg(r.error === "not_ready" ? "O anúncio ainda está carregando. Tente de novo em instantes." : "O anúncio não foi concluído, então o download não foi liberado.");
    }
    setAdBusy(false);
  }

  const goDownloads = () => { onClose(); navigate("/downloads"); };
  const servers = stream?.servers.filter((x) => x.ok) ?? [];

  return createPortal(
    <div className="dl-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dl-card" role="dialog" aria-modal="true" aria-label="Baixar">
        <div className="dl-head">
          <span className="dl-head-ico"><Icon name="download" size={22} strokeWidth={2.4} /></span>
          <div className="dl-head-txt">
            <small>Download</small>
            <h2>{added ? "Download iniciado" : "Baixar no aplicativo"}</h2>
          </div>
          <button type="button" className="dl-x" onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} /></button>
        </div>

        <div className="dl-what">
          <b>{sub}</b>
          <span>Salvo no app, dá para assistir sem internet</span>
        </div>

        {added ? (
          <div className="dl-done">
            <p>Pronto! Acompanhe o progresso na aba <b>Downloads</b>. Pode fechar o app: ele continua baixando.</p>
            <button type="button" className="btn btn-primary" onClick={goDownloads}>Ver downloads</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
          </div>
        ) : existing ? (
          <div className="dl-done">
            <p>{existing.status === "done" ? <>Você já baixou este vídeo ({fmtBytes(existing.bytes)}).</> : <>Este vídeo já está na sua lista de downloads.</>}</p>
            <button type="button" className="btn btn-primary" onClick={goDownloads}>Ver downloads</button>
          </div>
        ) : (
          <>
            {servers.length > 1 && (
              <div className="dl-servers" role="group" aria-label="Servidor">
                <span className="dl-servers-lb"><Icon name="server" size={15} /> Servidor</span>
                <div className="dl-chips">
                  <button type="button" className={`dl-chip${server === AUTO ? " on" : ""}`} disabled={busy}
                    onClick={() => { setServer(AUTO); void prepare(req, AUTO); }}>Automático</button>
                  {servers.map((s) => (
                    <button key={s.label} type="button" className={`dl-chip${server === s.label ? " on" : ""}`} disabled={busy}
                      onClick={() => { setServer(s.label); void prepare(req, s.label); }}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="dl-servers" role="group" aria-label="Qualidade">
              <span className="dl-servers-lb"><Icon name="settings" size={15} /> Qualidade</span>
              <div className="dl-chips">
                {QUALITIES.map((q) => (
                  <button key={q.v} type="button" className={`dl-chip${quality === q.v ? " on" : ""}`} disabled={busy}
                    onClick={() => { setQ(q.v); setQuality(q.v); }}>{q.label}</button>
                ))}
              </div>
            </div>

            {limit && (
              <div className="dl-limit" role="alert">
                <b>Limite de downloads do mês atingido</b>
                <span>Plano {limit.name}: {limit.used} de {limit.limit} usados.</span>
                {limit.plan_id === "free" && adsOn && (
                  <button type="button" className="btn btn-primary" disabled={adBusy} onClick={() => void watchAd()}>
                    {adBusy ? <Spinner size={15} /> : null} Assistir anúncio e ganhar +1 download
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => { onClose(); navigate("/planos"); }}>Ver planos</button>
              </div>
            )}

            <button type="button" className="dl-go" disabled={busy || loadingLink || !!limit} onClick={() => void start()}>
              {busy || loadingLink ? <Spinner size={18} /> : <Icon name="download" size={20} strokeWidth={2.4} />}
              <span>{loadingLink ? "Preparando o vídeo…" : busy ? "Iniciando…" : "Baixar agora"}</span>
            </button>

            {msg && (
              <p className="dl-error" role="alert">
                {msg}
                <button type="button" onClick={() => void prepare(req, server)}>Tentar de novo</button>
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
