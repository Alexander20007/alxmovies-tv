import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { posterUrl, tmdb } from "@/services/tmdb";
import { DownloadButton, Footer, Nav } from "./Chrome";
import { isAndroid, isDesktop, useRelease } from "./release";
import { Link } from "react-router-dom";

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: "🎬", title: "Filmes e séries", text: "Catálogo atualizado, com detalhes, elenco, trailer e a opção de continuar de onde parou." },
  { icon: "📡", title: "TV ao vivo", text: "Canais de TV ao vivo com a programação do que está passando agora e do que vem a seguir." },
  { icon: "👥", title: "Salas para assistir junto", text: "Todo mundo vê a mesma coisa ao mesmo tempo, com chat, reações e fila de filmes." },
  { icon: "✨", title: "Laura IA", text: "Uma assistente que recomenda e abre filmes, séries e canais — por texto ou por voz." },
  { icon: "⬇️", title: "Downloads dentro do app", text: "Baixe filmes e episódios, acompanhe o progresso e assista sem internet, como no YouTube." },
  { icon: "🛡️", title: "Perfis e controle parental", text: "Cada pessoa com o seu perfil e a classificação indicativa liberada para cada um." },
  { icon: "💬", title: "Amigos e mensagens", text: "Converse, adicione amigos e receba os avisos das conversas no celular." },
  { icon: "⭐", title: "Sua lista e avaliações", text: "Salve o que quer ver, marque como visto e diga o que achou: gostei, amei ou não gostei." },
  { icon: "🎞️", title: "Trailers e informações", text: "Veja o trailer, o elenco e a filmografia de qualquer ator ou atriz." },
  { icon: "🎚️", title: "Assista do seu jeito", text: "Legendas, qualidade da imagem, velocidade e ajuste de brilho e volume na ponta do dedo." },
  { icon: "🔔", title: "Avisos e novidades", text: "Notificações de mensagens, avisos da equipe e aviso quando existe versão nova do app." },
  { icon: "🎡", title: "Planos e Roda da Sorte", text: "Entre no site, gire a roda todo dia e ganhe downloads extras ou um plano por alguns dias." },
  { icon: "🛠️", title: "Seja admin", text: "Faça um teste rápido no site e ganhe Premium, selo de admin e um painel para ajudar a equipe." },
  { icon: "🔄", title: "Sempre atualizado", text: "Atualize o app em poucos toques, sem precisar voltar ao site." },
];

const STEPS = [
  { t: "Baixe o arquivo", d: "Toque em “Baixar o app” e aguarde o ALXmovies.apk terminar de baixar." },
  { t: "Abra o arquivo", d: "Abra o download pelo aviso do navegador ou pelo app Arquivos. Se o Android pedir, ative “Permitir desta fonte”." },
  { t: "Instale", d: "Toque em Instalar. O Android pode avisar que o app não veio da Play Store — é normal para apps instalados por APK." },
  { t: "Entre e aproveite", d: "Abra o ALXmovies, crie sua conta ou entre e pronto. As próximas atualizações são avisadas dentro do app." },
];

const FAQ = [
  { q: "O app é gratuito?", a: "Existe o plano Grátis, com anúncios e um limite mensal de downloads. Os planos Apoiador, Premium e Família têm mais downloads e sem anúncios, e você também pode ganhar um plano na Roda da Sorte." },
  { q: "Por que o site não tem os filmes?", a: "No site você cria e gerencia a conta, vê os planos, gira a Roda da Sorte e baixa o app. Tudo o que você assiste — filmes, séries, canais e salas — fica no aplicativo." },
  { q: "Posso assistir sem internet?", a: "Pode. Baixe o filme ou episódio dentro do app, abra a aba Downloads e assista quando quiser, mesmo sem conexão." },
  { q: "Como viro admin?", a: "Entre na sua conta no site e faça o teste em “Seja admin”. Quem passa ganha o plano Premium incluso, o selo de admin e um painel para sugerir avisos." },
  { q: "Preciso criar uma conta?", a: "Sim, uma conta gratuita. Com ela você tem seus perfis, sua lista, o que já viu e pode usar as salas e conversar com amigos." },
  { q: "Funciona no iPhone?", a: "Por enquanto só em celulares Android. Abra este site no seu Android para baixar." },
  { q: "Posso ter perfis para a família?", a: "Pode. Cada perfil tem a sua lista e a classificação indicativa liberada para ele, ideal para crianças." },
  { q: "Como atualizo o app?", a: "O próprio app avisa quando há uma versão nova (também por notificação) e atualiza sem você precisar voltar aqui." },
  { q: "A instalação não abriu, e agora?", a: "Confirme que você permitiu instalar apps desta fonte (Configurações › Segurança ou Apps) e tente abrir o arquivo de novo. Se baixou pela barra de notificações, abra por lá." },
];

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "");

function usePosters() {
  const q = useQuery({ queryKey: ["web-trending"], queryFn: () => tmdb.trending("movie", "week"), staleTime: 30 * 60_000, retry: 0 });
  return (q.data?.results ?? []).filter((m) => m.poster_path);
}

function PhoneWall({ posters }: { posters: { id: number; poster_path: string | null }[] }) {
  const list = posters.slice(0, 18);
  const cols = [0, 1, 2].map((c) => list.filter((_, i) => i % 3 === c));
  return (
    <div className="wb-phone" aria-hidden>
      <div className="wb-phone-top"><b>ALXMOVIES</b><i /><i /></div>
      <div className="wb-wall">
        {cols.map((col, ci) => (
          <div key={ci} className={`wb-col c${ci}`}>
            {[...col, ...col].map((m, i) => <img key={`${m.id}-${i}`} src={posterUrl(m.poster_path, "w342")} alt="" loading="lazy" />)}
            {!col.length && Array.from({ length: 6 }, (_, i) => <span key={i} className="wb-tile" />)}
          </div>
        ))}
      </div>
      <div className="wb-phone-nav"><i /><i /><i /><i /><i /></div>
    </div>
  );
}

/** Mini-telas desenhadas em CSS para mostrar como o app é, sem precisar de capturas de tela. */
const SHOWS = [
  { id: "inicio", tab: "Início", title: "Tudo na tela inicial", text: "Destaques que passam sozinhos, o que você estava vendo, filmes e séries em alta e atalhos para tudo." },
  { id: "canais", tab: "TV ao vivo", title: "Canais ao vivo", text: "Veja quais canais estão no ar agora, o programa atual e o próximo, e abra com um toque." },
  { id: "salas", tab: "Salas", title: "Assista junto", text: "Crie uma sala, chame os amigos e vejam juntos, com chat e reações em tempo real." },
  { id: "laura", tab: "Laura IA", title: "Peça para a Laura", text: "Diga o que quer ver. A Laura indica, abre o filme ou o canal e cuida da sua lista." },
] as const;

function Screen({ id, posters }: { id: (typeof SHOWS)[number]["id"]; posters: { id: number; poster_path: string | null }[] }) {
  if (id === "inicio") {
    return (
      <div className="wb-scr">
        <div className="wb-scr-hero">{posters[0] && <img src={posterUrl(posters[0].poster_path, "w342")} alt="" />}<div><small>EM ALTA HOJE</small><b>Título em destaque</b></div></div>
        <p className="wb-scr-h">Continuar assistindo</p>
        <div className="wb-scr-row">{posters.slice(1, 5).map((m) => <img key={m.id} src={posterUrl(m.poster_path, "w342")} alt="" />)}</div>
        <p className="wb-scr-h">Em alta</p>
        <div className="wb-scr-row">{posters.slice(5, 9).map((m) => <img key={m.id} src={posterUrl(m.poster_path, "w342")} alt="" />)}</div>
      </div>
    );
  }
  if (id === "canais") {
    const ch = [["📰", "Notícias"], ["⚽", "Esportes"], ["🎬", "Filmes"], ["🧸", "Infantil"], ["🎵", "Música"], ["📺", "Variedades"]];
    return (
      <div className="wb-scr">
        <p className="wb-scr-h">📡 Canais ao vivo</p>
        <div className="wb-scr-ch">{ch.map(([e, n], i) => <span key={n}><em className={i === 5 ? "off" : ""}>{i === 5 ? "OFFLINE" : "AO VIVO"}</em><b>{e}</b><small>{n}</small></span>)}</div>
        <div className="wb-scr-now"><small>AGORA</small><b>Programa em exibição</b><i><u /></i></div>
      </div>
    );
  }
  if (id === "salas") {
    return (
      <div className="wb-scr">
        <div className="wb-scr-video"><span>▶</span></div>
        <div className="wb-scr-chat">
          <p><b>Ana</b> bora começar! 🍿</p>
          <p className="me">Já estou aqui</p>
          <p><b>Beto</b> que cena 😮</p>
        </div>
        <div className="wb-scr-people"><span>A</span><span>B</span><span>C</span><span>+2</span></div>
      </div>
    );
  }
  return (
    <div className="wb-scr">
      <div className="wb-scr-msgs">
        <p className="me">Quero um filme de ação para hoje</p>
        <p className="bot">Separei três opções para você 🎬</p>
        <div className="wb-scr-row">{posters.slice(9, 12).map((m) => <img key={m.id} src={posterUrl(m.poster_path, "w342")} alt="" />)}</div>
        <p className="me">Reproduzir o primeiro</p>
        <p className="done">✓ Abrindo o filme…</p>
      </div>
    </div>
  );
}

function Showcase({ posters }: { posters: { id: number; poster_path: string | null }[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % SHOWS.length), 6000); return () => clearInterval(t); }, []);
  const cur = SHOWS[i];
  return (
    <div className="wb-show">
      <div className="wb-show-txt">
        <div className="wb-tabs" role="tablist">
          {SHOWS.map((s, n) => <button key={s.id} type="button" role="tab" aria-selected={n === i} className={n === i ? "on" : ""} onClick={() => setI(n)}>{s.tab}</button>)}
        </div>
        <h3>{cur.title}</h3>
        <p>{cur.text}</p>
      </div>
      <div className="wb-mock"><Screen id={cur.id} posters={posters} /></div>
    </div>
  );
}

function ShareSite() {
  const [done, setDone] = useState(false);
  const go = async () => {
    const data = { title: "ALXmovies", text: "Filmes, séries e TV ao vivo no seu celular Android.", url: window.location.origin };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url); setDone(true); setTimeout(() => setDone(false), 2000);
    } catch { /* cancelou */ }
  };
  return <button type="button" className="wb-btn" onClick={() => void go()}>{done ? "Link copiado!" : "Convidar um amigo"}</button>;
}

export default function Landing() {
  const { info, apkUrl } = useRelease();
  const posters = usePosters();
  const [params] = useSearchParams();
  const [open, setOpen] = useState<number | null>(0);
  const [stick, setStick] = useState(false);
  useEffect(() => { document.title = "ALXmovies — Filmes, séries e TV ao vivo no seu celular"; }, []);
  useEffect(() => {
    const on = () => setStick(window.scrollY > 560);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="wb">
      <Nav />
      {params.get("reset") === "ok" && <div className="wb-banner ok">Senha alterada com sucesso! Abra o app do ALXmovies e entre com a nova senha.</div>}

      <section className="wb-hero">
        <div className="wb-glow" aria-hidden />
        <div className="wb-hero-txt">
          <span className="wb-pill">Para Android · Grátis</span>
          <h1>Filmes, séries e <span>TV ao vivo</span> no seu celular</h1>
          <p>Um só app para assistir, salvar sua lista, conversar com amigos e ver junto em salas. Baixe o ALXmovies e comece agora.</p>
          <div className="wb-cta"><DownloadButton big /></div>
          <ul className="wb-meta">
            {info?.version && <li>Versão <b>{info.version}</b></li>}
            {info?.date && <li>Atualizado em <b>{fmtDate(info.date)}</b></li>}
            {info && info.downloads > 0 && <li><b>{info.downloads.toLocaleString("pt-BR")}</b> downloads</li>}
          </ul>
        </div>
        <PhoneWall posters={posters} />
      </section>

      <section className="wb-stats">
        <div><b>🎬</b><span>Filmes e séries</span></div>
        <div><b>📡</b><span>TV ao vivo</span></div>
        <div><b>👥</b><span>Salas e amigos</span></div>
        <div><b>✨</b><span>Laura IA</span></div>
      </section>

      <section className="wb-sec" id="recursos">
        <h2>Tudo o que o app faz por você</h2>
        <p className="wb-sub">Uma conta, um app, tudo no seu celular.</p>
        <div className="wb-grid">
          {FEATURES.map((f) => <article key={f.title} className="wb-card"><span>{f.icon}</span><h3>{f.title}</h3><p>{f.text}</p></article>)}
        </div>
      </section>

      <section className="wb-sec" id="telas">
        <h2>Conheça por dentro</h2>
        <p className="wb-sub">Um jeito simples e bonito de assistir.</p>
        <Showcase posters={posters} />
      </section>

      {posters.length > 0 && (
        <section className="wb-sec wide">
          <h2>Em alta agora no app</h2>
          <p className="wb-sub">Os filmes mais vistos da semana.</p>
          <div className="wb-strip">{posters.slice(0, 14).map((m) => <img key={m.id} src={posterUrl(m.poster_path, "w342")} alt="" loading="lazy" />)}</div>
        </section>
      )}

      {info && info.notes.length > 0 && (
        <section className="wb-sec narrow">
          <h2>Novidades da versão {info.version}</h2>
          <ul className="wb-notes">{info.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}

      <section className="wb-sec narrow" id="roda">
        <h2>🎡 Roda da Sorte</h2>
        <p className="wb-sub">Entre na sua conta, gire uma vez por dia e ganhe downloads extras ou um plano por alguns dias.</p>
        <div className="wb-row center" style={{ marginTop: 22 }}>
          <Link className="wb-btn primary big" to="/roda">Girar a roda</Link>
          <Link className="wb-btn big" to="/planos">Ver planos</Link>
        </div>
      </section>

      <section className="wb-sec" id="instalar">
        <h2>Como instalar</h2>
        <p className="wb-sub">Leva menos de um minuto.</p>
        <ol className="wb-steps">
          {STEPS.map((s, i) => <li key={s.t}><span>{i + 1}</span><div><h3>{s.t}</h3><p>{s.d}</p></div></li>)}
        </ol>
        <div className="wb-cta center"><DownloadButton big /></div>
        {isDesktop() && (
          <div className="wb-qr">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(window.location.origin)}`} alt="QR code para abrir o site no celular" width={150} height={150} />
            <p><b>Está no computador?</b><br />Aponte a câmera do celular Android para o código e baixe por lá.</p>
          </div>
        )}
      </section>

      <section className="wb-sec narrow" id="faq">
        <h2>Dúvidas frequentes</h2>
        <div className="wb-faq">
          {FAQ.map((f, i) => (
            <div key={f.q} className={`wb-q${open === i ? " open" : ""}`}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><span>{f.q}</span><i /></button>
              {open === i && <p>{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="wb-final">
        <h2>Pronto para assistir?</h2>
        <p>Baixe o ALXmovies e tenha tudo na palma da mão.</p>
        <div className="wb-cta center"><DownloadButton big /><ShareSite /></div>
      </section>
      <Footer />

      {isAndroid() && stick && (
        <a className="wb-sticky" href={apkUrl}><span>ALXmovies</span><b>Baixar o app</b></a>
      )}
    </div>
  );
}
