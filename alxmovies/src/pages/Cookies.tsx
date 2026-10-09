import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SiteFooter } from "@/components/SiteFooter";

export default function Cookies() {
  useEffect(() => { document.title = "Política de Cookies | ALXmovies"; }, []);
  return (
    <>
<div className="legal-page">
    <Link to="/home" className="legal-back">← Voltar ao ALXmovies</Link>
    <h1>Política de Cookies</h1>
    <p className="legal-updated">Última atualização: 22 de agosto de 2026</p>

    <div className="legal-disclaimer">
      Este documento é um modelo detalhado, não um parecer jurídico.
      Recomendamos revisão por um profissional especializado em proteção
      de dados (LGPD) antes de considerá-lo juridicamente definitivo.
    </div>

    <h2>1. O que conta como "cookie" aqui</h2>
    <p>Além de cookies tradicionais, o ALXmovies usa <strong>localStorage</strong>
    e <strong>sessionStorage</strong> do navegador — tecnologias parecidas,
    que guardam pequenas informações no seu próprio aparelho. Tratamos
    todas elas da mesma forma nesta política.</p>

    <h2>2. Cookies essenciais (sempre ativos)</h2>
    <p>Sem estes, o site simplesmente não funciona — não pedimos
    consentimento pra eles porque não existe alternativa que preserve o
    funcionamento básico do login e da navegação.</p>
    <table className="legal-table">
      <tr><th>O que guarda</th><th>Para quê</th><th>Duração</th></tr>
      <tr><td>Sessão de autenticação (Supabase)</td><td>Manter você logado entre visitas</td><td>Até você sair ou a sessão expirar</td></tr>
      <tr><td>Perfil ativo</td><td>Lembrar qual perfil você escolheu</td><td>Até trocar de perfil ou sair</td></tr>
      <tr><td>Início da sessão de convidado</td><td>Controlar as 24h do modo convidado</td><td>24 horas</td></tr>
      <tr><td>Bloqueio biométrico ativado</td><td>Saber se deve pedir biometria ao abrir o app neste aparelho</td><td>Até você desativar</td></tr>
      <tr><td>Confirmação de consentimento de cookies</td><td>Não mostrar este aviso de novo</td><td>Até você limpar os dados do navegador</td></tr>
    </table>

    <h2>3. Cookies de preferência</h2>
    <p>Guardam escolhas que tornam sua experiência mais confortável, mas
    o site continua funcionando sem eles (só volta ao padrão).</p>
    <table className="legal-table">
      <tr><th>O que guarda</th><th>Para quê</th></tr>
      <tr><td>Reproduzir trailers automaticamente</td><td>Preferência definida no Painel da Conta</td></tr>
      <tr><td>Modo economia de dados</td><td>Preferência definida no Painel da Conta</td></tr>
      <tr><td>Avisos por e-mail de lançamentos</td><td>Preferência definida no Painel da Conta</td></tr>
    </table>

    <h2>4. Cookies de terceiros (publicidade)</h2>
    <p>O ALXmovies exibe anúncios através do <strong>Google AdSense</strong>,
    que define cookies próprios no seu navegador para medir desempenho
    dos anúncios e, dependendo das suas configurações de anúncio do
    Google, personalizar o que é exibido. Esses cookies são controlados
    pelo Google, não pelo ALXmovies diretamente.</p>
    <p>Você pode gerenciar ou desativar a personalização de anúncios do
    Google em:</p>
    <ul>
      <li><a href="https://adssettings.google.com" target="_blank" rel="noopener">adssettings.google.com</a> — configurações de anúncios da sua Conta Google</li>
      <li><a href="https://optout.aboutads.info" target="_blank" rel="noopener">optout.aboutads.info</a> — opt-out geral de publicidade comportamental</li>
    </ul>

    <h2>5. O que NÃO usamos</h2>
    <p>O ALXmovies não usa cookies de rastreamento de redes sociais, nem
    pixels de remarketing próprios, nem venda de dados de navegação para
    terceiros.</p>

    <h2>6. Seu consentimento</h2>
    <p>Na primeira visita, mostramos um aviso perguntando se você aceita
    todos os cookies ou só os essenciais. Sua escolha fica salva no seu
    navegador.</p>
    <div className="legal-disclaimer">
      Limitação atual, sem enrolação: escolher "só essenciais" registra
      sua preferência, mas o script do Google AdSense hoje carrega
      automaticamente em toda página, independente dessa escolha — o
      bloqueio efetivo de cookies de terceiros até haver consentimento
      explícito ainda não foi implementado tecnicamente. Se isso for
      importante pro seu caso (ex: LGPD/GDPR de forma mais rigorosa),
      é um ajuste técnico que pode ser feito depois.
    </div>

    <h2>7. Como apagar cookies manualmente</h2>
    <p>Você também pode limpar os dados deste site a qualquer momento
    diretamente nas configurações do seu navegador (em geral, em
    "Privacidade e segurança" → "Cookies e dados do site"). Isso vai te
    desconectar e resetar suas preferências locais.</p>

    <h2>8. Alterações nesta política</h2>
    <p>Podemos atualizar esta página conforme o site evolui. A data no
    topo sempre reflete a versão mais recente.</p>
  </div>
      <SiteFooter />
    </>
  );
}
