import { useEffect, useState } from "react";
import { ImmersivePage } from "@/components/ImmersivePage";
import { Icon } from "@/components/Icon";
import { CONFIG } from "@/lib/config";
import { apiFetch, currentToken, probeNonce } from "@/lib/proxy";
import { supabase } from "@/lib/supabase";
import { copyText, isNative } from "@/lib/native";
import { NativePlayer } from "@/lib/nativePlayer";

interface Row { name: string; ok: boolean; status: string; ms: number; note: string }

async function timed(name: string, fn: () => Promise<{ ok: boolean; status: string; note?: string }>): Promise<Row> {
  const t = performance.now();
  try {
    const r = await fn();
    return { name, ok: r.ok, status: r.status, ms: Math.round(performance.now() - t), note: r.note ?? "" };
  } catch (e) {
    return { name, ok: false, status: "falhou", ms: Math.round(performance.now() - t), note: e instanceof Error ? e.message : String(e) };
  }
}
const fromRes = async (r: Response) => ({ ok: r.ok, status: String(r.status), note: r.ok ? "" : (await r.text().catch(() => "")).slice(0, 120) });

/** Tela de teste: mostra, para cada serviço, se o proxy respondeu e com qual código (ajuda a achar o que está falhando). */
export default function Diagnostico() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [crash, setCrash] = useState<{ trace: string; at: number } | null>(null);
  const [crashCopied, setCrashCopied] = useState(false);
  useEffect(() => { if (isNative) void NativePlayer.getLastCrash().then((c) => setCrash(c.trace ? c : null)).catch(() => {}); }, []);

  async function run() {
    setRunning(true); setRows([]);
    const out: Row[] = [];
    const add = async (name: string, fn: () => Promise<{ ok: boolean; status: string; note?: string }>) => { out.push(await timed(name, fn)); setRows([...out]); };

    await add("Proxy ligado?", async () => ({ ok: true, status: CONFIG.USE_PROXY ? "sim" : "não (build direto)" }));
    if (CONFIG.USE_PROXY) await add("Nonce (/nonce)", async () => fromRes(await probeNonce()));
    await add("Sessão (JWT)", async () => { const t = await currentToken(); return { ok: !!t, status: t ? "ok" : "sem login", note: t ? "" : "Entre na conta" }; });
    await add("Supabase (tabela profiles)", async () => {
      const { error, status } = await supabase.from("profiles").select("id").limit(1);
      return { ok: !error, status: String(status), note: error?.message ?? "" };
    });
    await add("TMDB (função)", async () => fromRes(await apiFetch(CONFIG.TMDB_FUNCTION_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "genre/movie/list", params: { language: "pt-BR" } }),
    })));
    await add("Streaming (/alx)", async () => fromRes(await apiFetch(`${CONFIG.STREAM_BASE_URL}/api/servers/movie/550`)));
    await add("Canais", async () => fromRes(await apiFetch(CONFIG.CHANNELS_API_URL)));
    await add("Versão (GitHub)", async () => fromRes(await fetch(CONFIG.RELEASE_DIRECT_URL)));
    setRunning(false);
  }

  const report = rows ? rows.map((r) => `${r.ok ? "OK " : "ERRO"} ${r.name}: ${r.status} (${r.ms} ms)${r.note ? " — " + r.note : ""}`).join("\n") : "";

  return (
    <ImmersivePage back="/account">
      <div className="dg">
        <h1>Diagnóstico de conexão</h1>
        <p>Testa cada serviço e mostra o código que voltou. Se algo falhar, copie o relatório e mande para quem cuida do app.</p>
        <button type="button" className="dv-btn dv-primary" disabled={running} onClick={() => void run()}>
          <Icon name="play" size={20} />{running ? "Testando…" : rows ? "Testar de novo" : "Iniciar teste"}
        </button>
        {rows && (
          <div className="dg-list">
            {rows.map((r) => (
              <div key={r.name} className={`dg-row ${r.ok ? "ok" : "bad"}`}>
                <span className="dg-dot" />
                <div><b>{r.name}</b>{r.note && <small>{r.note}</small>}</div>
                <em>{r.status} · {r.ms} ms</em>
              </div>
            ))}
          </div>
        )}
        {crash && (
          <section className="dg-crash">
            <h2>Último fechamento inesperado do app</h2>
            <small>{new Date(crash.at).toLocaleString("pt-BR")}</small>
            <pre>{crash.trace.slice(0, 1800)}</pre>
            <div className="dv-row">
              <button type="button" className="dv-btn" onClick={() => void copyText(crash.trace).then(() => { setCrashCopied(true); setTimeout(() => setCrashCopied(false), 2000); })}>
                <Icon name="link" size={18} />{crashCopied ? "Copiado!" : "Copiar erro"}
              </button>
              <button type="button" className="dv-btn" onClick={() => void NativePlayer.clearLastCrash().then(() => setCrash(null))}>Limpar</button>
            </div>
          </section>
        )}
        {rows && rows.length > 0 && !running && (
          <button type="button" className="dv-btn" onClick={() => void copyText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
            <Icon name="link" size={19} />{copied ? "Relatório copiado!" : "Copiar relatório"}
          </button>
        )}
      </div>
    </ImmersivePage>
  );
}
