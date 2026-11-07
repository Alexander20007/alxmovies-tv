import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { PLAN_KEY } from "@/hooks/usePlan";
import { quiz, type QuizReply } from "@/services/staff";
import { SitePage } from "../SitePage";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Teste para virar admin: perguntas aleatórias sorteadas pelo servidor (IA); a correção também é no servidor. */
export default function WebAdminQuiz() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const logged = !!user && !user.is_anonymous;
  const [info, setInfo] = useState<QuizReply | null>(null);
  const [run, setRun] = useState<QuizReply | null>(null);       // tentativa em andamento
  const [result, setResult] = useState<QuizReply | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const sent = useRef(false);

  const refresh = useCallback(async () => { setInfo(null); setInfo(await quiz("status")); }, []);
  useEffect(() => { if (logged) void refresh(); }, [logged, refresh]);

  const submit = useCallback(async (a: (number | null)[], attemptId: string) => {
    if (sent.current) return;
    sent.current = true; setBusy(true);
    const r = await quiz("submit", { attemptId, answers: a.map((x) => (x == null ? -1 : x)) });
    setBusy(false); setRun(null); setResult(r);
    if (r.state === "done" && r.passed) { void qc.invalidateQueries({ queryKey: ["staff-status"] }); void qc.invalidateQueries({ queryKey: PLAN_KEY }); }
  }, [qc]);

  // contagem regressiva; no zero envia o que estiver respondido
  useEffect(() => {
    if (!run?.expiresAt) return;
    const end = new Date(run.expiresAt).getTime();
    const t = setInterval(() => {
      const d = end - Date.now();
      setLeft(d);
      if (d <= 0) { clearInterval(t); void submit(answers, run.attemptId!); }
    }, 500);
    return () => clearInterval(t);
  }, [run, answers, submit]);

  async function start() {
    setBusy(true);
    const r = await quiz("start");
    setBusy(false);
    if (r.state === "running" && r.questions) {
      sent.current = false;
      setRun(r); setAnswers(r.questions.map(() => null)); setI(0); setResult(null);
      setLeft(new Date(r.expiresAt!).getTime() - Date.now());
    } else setInfo(r);
  }

  if (!loading && !logged) return <Navigate to="/entrar?next=/admin/teste" replace />;

  // ---------- resultado ----------
  if (result) {
    return (
      <SitePage title={result.state === "done" && result.passed ? "🎉 Você é admin!" : "Resultado do teste"}>
        <section className="wb-card wb-quiz-res">
          {result.state === "done" ? (
            <>
              <b className={result.passed ? "ok" : "bad"}>{result.score} de {result.total} acertos</b>
              {result.passed ? (
                <>
                  <p>Parabéns! Você passou e agora faz parte da equipe. Sua conta já tem o plano Premium incluso e o selo de admin.</p>
                  <Link className="wb-btn primary" to="/admin">Abrir o painel de admin</Link>
                </>
              ) : (
                <>
                  <p>Você precisava de {result.pass} acertos. Sem problema: espere um pouco e tente de novo com perguntas novas.</p>
                  <button type="button" className="wb-btn" onClick={() => { setResult(null); void refresh(); }}>Voltar</button>
                </>
              )}
            </>
          ) : result.state === "expired" ? (
            <>
              <b className="bad">O tempo acabou</b>
              <p>A tentativa foi encerrada. Quando puder, comece outra.</p>
              <button type="button" className="wb-btn" onClick={() => { setResult(null); void refresh(); }}>Voltar</button>
            </>
          ) : (
            <>
              <b className="bad">Não foi possível corrigir</b>
              <p>Houve um problema de conexão. Tente de novo mais tarde.</p>
              <button type="button" className="wb-btn" onClick={() => { setResult(null); void refresh(); }}>Voltar</button>
            </>
          )}
        </section>
      </SitePage>
    );
  }

  // ---------- teste em andamento ----------
  if (run?.questions) {
    const qs = run.questions;
    const cur = qs[i];
    const answered = answers.filter((x) => x != null).length;
    return (
      <SitePage title="Teste de admin">
        <div className="wb-quiz-top">
          <span>Pergunta {i + 1} de {qs.length}</span>
          <span className={left < 120000 ? "bad" : ""}>⏱ {mmss(left)}</span>
        </div>
        <div className="wb-bar" aria-hidden><i style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
        <section className="wb-card wb-quiz-q">
          <h2>{cur.q}</h2>
          <div className="wb-quiz-opts">
            {cur.options.map((o, k) => (
              <button key={k} type="button" className={`wb-quiz-opt${answers[i] === k ? " on" : ""}`}
                onClick={() => setAnswers((a) => a.map((x, n) => (n === i ? k : x)))}>
                <i>{String.fromCharCode(65 + k)}</i><span>{o}</span>
              </button>
            ))}
          </div>
        </section>
        <div className="wb-row center">
          <button type="button" className="wb-btn" disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</button>
          {i < qs.length - 1
            ? <button type="button" className="wb-btn primary" onClick={() => setI(i + 1)}>Próxima</button>
            : <button type="button" className="wb-btn primary" disabled={busy || answered < qs.length} onClick={() => void submit(answers, run.attemptId!)}>{busy ? "Enviando…" : "Enviar respostas"}</button>}
        </div>
        {i === qs.length - 1 && answered < qs.length && <p className="wb-dim" style={{ textAlign: "center" }}>Faltam {qs.length - answered} pergunta(s) sem resposta.</p>}
      </SitePage>
    );
  }

  // ---------- tela inicial ----------
  return (
    <SitePage title="Seja admin do ALXmovies" sub="Ajude a equipe e ganhe vantagens. Faça um teste rápido: se passar, sua conta vira admin.">
      {!info ? <p className="wb-dim" style={{ textAlign: "center" }}>Carregando…</p> : info.state === "already" ? (
        <section className="wb-card wb-quiz-res"><b className="ok">Você já é admin</b><p>Veja suas vantagens e o painel.</p><Link className="wb-btn primary" to="/admin">Abrir o painel</Link></section>
      ) : info.state === "limit" ? (
        <section className="wb-card wb-quiz-res"><b className="bad">Limite de tentativas</b><p>Você já fez {info.maxPerDay ?? 3} tentativas nas últimas 24 horas. Tente de novo depois de {when(info.retryAt)}.</p></section>
      ) : info.state === "cooldown" ? (
        <section className="wb-card wb-quiz-res"><b className="bad">Espere um pouco</b><p>Você poderá tentar de novo depois de {when(info.retryAt)}. As perguntas serão outras.</p></section>
      ) : info.state === "ready" ? (
        <>
          <section className="wb-card wb-quiz-rules">
            <h2>Como funciona</h2>
            <ul>
              <li><b>{info.total} perguntas</b> de múltipla escolha, sorteadas na hora (cada teste é diferente).</li>
              <li>Para passar: <b>{info.pass} acertos</b> ou mais.</li>
              <li>Você tem <b>{info.minutes} minutos</b> depois de começar.</li>
              <li>Até {info.maxPerDay} tentativas por dia; se errar, espere 30 minutos.</li>
              <li>Os temas são bom senso e conduta: respeito, privacidade, segurança de crianças, golpes e sigilo.</li>
            </ul>
            <h2>O que o admin ganha</h2>
            <ul>
              <li>Plano <b>Premium incluso</b>: sem anúncios e com mais downloads por mês.</li>
              <li>Selo de admin na conta e painel exclusivo.</li>
              <li>Pode <b>sugerir avisos</b> para todos os usuários (o dono aprova).</li>
            </ul>
            <p className="wb-dim">O dono pode remover o acesso de quem não cumprir as regras da comunidade.</p>
          </section>
          <div className="wb-row center"><button type="button" className="wb-btn primary big" disabled={busy} onClick={() => void start()}>{busy ? "Preparando o teste…" : "Começar o teste"}</button></div>
        </>
      ) : (
        <section className="wb-card wb-quiz-res"><b className="bad">Não foi possível carregar</b><p>Tente de novo em instantes.</p><button type="button" className="wb-btn" onClick={() => void refresh()}>Tentar de novo</button></section>
      )}
    </SitePage>
  );
}
