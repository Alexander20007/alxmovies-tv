import { useCallback, useEffect, useRef, useState } from "react";
import { isNative, onAppResume } from "@/lib/native";
import { useBackClose } from "@/hooks/useBackClose";
import { Icon } from "@/components/Icon";
import { AppUpdater, checkForUpdate, type UpdateInfo } from "@/lib/updater";

type Phase = "idle" | "available" | "downloading" | "permission" | "installing" | "error";

const IGNORE_KEY = "alx.update.ignored";
const mb = (n: number) => (n / 1048576).toFixed(1).replace(".", ",");
const getIgnored = () => { try { return localStorage.getItem(IGNORE_KEY); } catch { return null; } };

function Ring({ pct, indeterminate }: { pct: number; indeterminate: boolean }) {
  const r = 70, c = 2 * Math.PI * r;
  return (
    <svg className={`ux-ring${indeterminate ? " spin" : ""}`} viewBox="0 0 160 160" aria-hidden>
      <defs>
        <linearGradient id="ux-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ff6a72" /><stop offset="100%" stopColor="#e50914" /></linearGradient>
      </defs>
      <circle cx="80" cy="80" r={r} className="ux-ring-bg" />
      <circle cx="80" cy="80" r={r} className="ux-ring-fg" stroke="url(#ux-grad)" strokeDasharray={c} strokeDashoffset={indeterminate ? c * 0.72 : c * (1 - pct / 100)} />
    </svg>
  );
}

type Note = { t: "ver" | "cat" | "li"; text: string };

const clean = (l: string) => l.replace(/^[\s>*\u2022-]+/, "").replace(/^\d+[.)]\s+/, "").replace(/[*_`]/g, "").trim();
/** Texto antigo/automático das releases: não é novidade de verdade. */
const GENERIC = /baixe o arquivo|apk android do alxmovies|full changelog|^what's changed$/i;

/** Transforma o texto das Releases em linhas: "# v1.1.0" = versão, "## Novo" = categoria, "- item" = novidade. */
function parseNotes(raw: string): Note[] {
  const out: Note[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const h = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const text = clean(h[2]);
      if (text) out.push({ t: h[1].length === 1 ? "ver" : "cat", text });
      continue;
    }
    const text = clean(line);
    if (text && !GENERIC.test(text)) out.push({ t: "li", text });
  }
  // versão/categoria sem nenhum item embaixo não aparece
  const res: Note[] = [];
  for (let i = 0; i < out.length; i++) {
    const n = out[i];
    if (n.t === "li") { res.push(n); continue; }
    let ok = false;
    for (let k = i + 1; k < out.length; k++) {
      if (out[k].t === "li") { ok = true; break; }
      if (out[k].t === n.t || out[k].t === "ver") break;
    }
    if (ok) res.push(n);
  }
  return res;
}

const Rocket = () => (
  <svg viewBox="0 0 48 48" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M24 6c6 4.5 9.5 11 9.5 18.5 0 3.2-.6 6-1.7 8.5H16.2c-1.1-2.5-1.7-5.3-1.7-8.5C14.5 17 18 10.5 24 6z" />
    <circle cx="24" cy="21" r="3.6" />
    <path d="M16.2 33c-3 .2-5.2 2-6 5 3-.2 5-.9 6.3-2.4M31.8 33c3 .2 5.2 2 6 5-3-.2-5-.9-6.3-2.4M20.5 38.5c.6 2.2 1.7 3.5 3.5 4.5 1.8-1 2.9-2.3 3.5-4.5" />
  </svg>
);

/** Tela de atualização: novidades reais de cada versão, botão "Atualizar agora" (baixa e instala no próprio app), progresso e instalação. */
export function UpdatePrompt() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState({ received: 0, percent: 0, total: 0 });
  const [error, setError] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  // Procura versão nova ao abrir, ao voltar para o app e quando a pessoa toca na notificação de atualização.
  const lastCheck = useRef(0);
  const runCheck = useCallback((force: boolean) => {
    if (!isNative || (phaseRef.current !== "idle" && phaseRef.current !== "available")) return;
    if (!force && Date.now() - lastCheck.current < 20 * 60_000) return;
    lastCheck.current = Date.now();
    void checkForUpdate().then((u) => {
      if (!u || (!force && getIgnored() === u.version)) return;
      if (force) { try { localStorage.removeItem(IGNORE_KEY); } catch { /* sem armazenamento */ } }
      setInfo(u); setPhase("available");
    });
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const onEvt = () => runCheck(true);
    window.addEventListener("alx:check-update", onEvt);
    const off = onAppResume(() => runCheck(false));
    return () => { window.removeEventListener("alx:check-update", onEvt); void off.then((h) => h.remove()).catch(() => {}); };
  }, [runCheck]);

  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    void AppUpdater.cleanup().catch(() => {});
    runCheck(false);
    return () => { alive = false; };
  }, []);

  const openInstaller = useCallback(async () => {
    try {
      const { allowed } = await AppUpdater.canInstall();
      if (!allowed) { setPhase("permission"); return; }
      setPhase("installing");
      await AppUpdater.install();
    } catch (e) {
      setError((e as Error)?.message || "Não foi possível abrir o instalador.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const sub = onAppResume(() => { if (phaseRef.current === "permission") void openInstaller(); });
    return () => { void sub.then((h) => h.remove()); };
  }, [openInstaller]);

  const downloadInApp = async () => {
    if (!info) return;
    setProgress({ received: 0, percent: 0, total: info.size });
    setPhase("downloading");
    const sub = await AppUpdater.addListener("downloadProgress", (p) => setProgress(p));
    try {
      await AppUpdater.download({ url: info.url, size: info.size });
      await sub.remove();
      await openInstaller();
    } catch (e) {
      await sub.remove();
      const msg = (e as Error)?.message || "";
      if (msg === "cancelled") { setPhase("available"); return; }
      setError(msg || "Falha no download. Verifique sua conexão.");
      setPhase("error");
    }
  };

  const dismiss = () => { if (phaseRef.current !== "downloading") setPhase("idle"); };
  const ignore = () => { if (info) { try { localStorage.setItem(IGNORE_KEY, info.version); } catch { /* sem armazenamento */ } } setPhase("idle"); };
  useBackClose(phase !== "idle", dismiss);

  if (!isNative || phase === "idle" || !info) return null;

  const indeterminate = phase === "downloading" && progress.percent < 0;
  const pct = Math.max(0, progress.percent);
  const notes = parseNotes(info.notes);
  const total = notes.filter((n) => n.t === "li").length;
  const LIMIT = 6;
  let seen = 0;
  const shown = notesOpen ? notes : notes.filter((n) => { if (n.t !== "li") return seen < LIMIT; seen++; return seen <= LIMIT; });

  return (
    <div className="ux" role="dialog" aria-modal="true" aria-label="Atualização do app">
      <div className="ux-glow" aria-hidden />
      <div className="ux-scroll">
        {phase === "available" && (<>
          <div className="ux-hero">
            <div className="ux-badge"><span className="ux-pulse" /><Rocket /></div>
            <h1>Nova versão disponível</h1>
            <p className="ux-sub">O ALXmovies ficou ainda melhor. Atualize para aproveitar as novidades.</p>
            <div className="ux-vers">
              <span>v{info.current}</span><Icon name="chevronRight" size={16} strokeWidth={2.8} /><b>v{info.version}</b>
              {info.size > 0 && <em>{mb(info.size)} MB</em>}
            </div>
          </div>

          <section className="ux-card">
            <h3>O que há de novo</h3>
            {notes.length > 0 ? (
              <div className="ux-notes">
                {shown.map((n, i) => n.t === "li"
                  ? <p key={i} className="ux-note"><span><Icon name="check" size={13} strokeWidth={3.4} /></span>{n.text}</p>
                  : <h4 key={i} className={n.t === "ver" ? "ux-ver" : "ux-cat"}>{n.text}</h4>)}
              </div>
            ) : (
              <div className="ux-notes"><p className="ux-note"><span><Icon name="check" size={13} strokeWidth={3.4} /></span>Melhorias de desempenho e correções.</p></div>
            )}
            {total > LIMIT && <button type="button" className="ux-link" onClick={() => setNotesOpen((v) => !v)}>{notesOpen ? "Ver menos" : `Ver mais (${total - LIMIT})`}</button>}
          </section>

        </>)}

        {phase === "downloading" && (
          <div className="ux-center">
            <div className="ux-ring-wrap">
              <Ring pct={pct} indeterminate={indeterminate} />
              <strong>{indeterminate ? "…" : `${pct}%`}</strong>
            </div>
            <h1>Baixando atualização</h1>
            <p>{indeterminate ? `${mb(progress.received)} MB` : `${mb(progress.received)} de ${mb(progress.total)} MB`}</p>
            <small className="ux-hint">Pode usar outros apps enquanto baixa — só não feche o ALXmovies.</small>
          </div>
        )}

        {phase === "permission" && (
          <div className="ux-center">
            <div className="ux-badge sm"><Icon name="info" size={40} strokeWidth={2.2} /></div>
            <h1>Permitir instalação</h1>
            <p>Download concluído! Para instalar, o Android precisa que você permita ao ALXmovies instalar atualizações. Toque em permitir, ative a opção e volte para o app.</p>
          </div>
        )}

        {phase === "installing" && (
          <div className="ux-center">
            <div className="ux-badge sm ok"><Icon name="check" size={44} strokeWidth={3} /></div>
            <h1>Pronto para instalar</h1>
            <p>Confirme a instalação na tela do Android. O app reinicia quando terminar.</p>
          </div>
        )}

        {phase === "error" && (
          <div className="ux-center">
            <div className="ux-badge sm err"><Icon name="close" size={42} strokeWidth={3} /></div>
            <h1>Não deu certo</h1>
            <p>{error}</p>
          </div>
        )}
      </div>

      <div className="ux-foot">
        {phase === "available" && (<>
          <button type="button" className="ux-cta" onClick={() => void downloadInApp()}><Icon name="download" size={22} strokeWidth={2.6} />Atualizar agora</button>
          <div className="ux-foot-row">
            <button type="button" onClick={dismiss}>Agora não</button>
            <i />
            <button type="button" onClick={ignore}>Ignorar esta versão</button>
          </div>
        </>)}
        {phase === "downloading" && <button type="button" className="ux-ghost" onClick={() => void AppUpdater.cancel()}>Cancelar</button>}
        {phase === "permission" && (<>
          <button type="button" className="ux-cta" onClick={() => void AppUpdater.openInstallSettings()}>Permitir</button>
          <div className="ux-foot-row"><button type="button" onClick={dismiss}>Depois</button></div>
        </>)}
        {phase === "installing" && (<>
          <button type="button" className="ux-cta" onClick={() => void openInstaller()}>Instalar de novo</button>
          <div className="ux-foot-row"><button type="button" onClick={dismiss}>Fechar</button></div>
        </>)}
        {phase === "error" && (<>
          <button type="button" className="ux-cta" onClick={() => setPhase("available")}>Tentar de novo</button>
          <div className="ux-foot-row"><button type="button" onClick={dismiss}>Fechar</button></div>
        </>)}
      </div>
    </div>
  );
}
