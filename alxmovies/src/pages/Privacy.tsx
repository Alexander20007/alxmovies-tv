import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SiteFooter } from "@/components/SiteFooter";

export default function Privacy() {
  useEffect(() => { document.title = "Política de Privacidade | ALXmovies"; }, []);
  return (
    <>
<div className="legal-page">
    <Link to="/home" className="legal-back">← Voltar ao ALXmovies</Link>
    <h1>Política de Privacidade</h1>
    <p className="legal-updated">Última atualização: 22 de agosto de 2026</p>

    <div className="legal-disclaimer">
      Este documento é um modelo geral, escrito com base exatamente no
      que o código do ALXmovies faz — não é um parecer jurídico.
      Recomendamos revisão por um advogado especializado em proteção de
      dados (LGPD) antes de publicar, principalmente se o site tiver
      fins comerciais.
    </div>

    <h2>1. Quais dados coletamos</h2>
    <h3>Dados da conta</h3>
    <ul>
      <li>E-mail e senha (a senha nunca é armazenada em texto legível)</li>
      <li>Nome de usuário e telefone (opcional)</li>
      <li>Data de criação da conta</li>
    </ul>
    <h3>Dados de perfil</h3>
    <ul>
      <li>Nome do perfil, idade (opcional), foto de perfil</li>
      <li>Classificação indicativa escolhida e se é perfil infantil</li>
      <li>PIN de perfil (se configurado)</li>
    </ul>
    <h3>Dados de uso</h3>
    <ul>
      <li>Favoritos, avaliações e comentários que você faz</li>
      <li>Histórico e progresso de reprodução</li>
      <li>Perguntas feitas ao assistente de IA dentro do site</li>
    </ul>
    <h3>Dados técnicos</h3>
    <ul>
      <li>Endereço IP, tipo de navegador e dispositivo</li>
      <li>Cookies e armazenamento local — detalhado na nossa
        <Link to="/cookies">Política de Cookies</Link></li>
    </ul>

    <h2>2. Contas de convidado</h2>
    <p>Se você usa o "Entrar como convidado", criamos uma conta
    temporária sem e-mail nem senha, válida por 24 horas. Depois desse
    prazo, a conta e todos os dados associados a ela são apagados
    automaticamente e de forma permanente.</p>

    <h2>3. Biometria</h2>
    <p>Se você ativa o desbloqueio biométrico, sua digital, rosto ou PIN
    do dispositivo nunca chega ao ALXmovies — essa verificação acontece
    inteiramente no seu aparelho (padrão WebAuthn). Não coletamos nem
    armazenamos nenhum dado biométrico.</p>

    <h2>4. Com quem compartilhamos dados</h2>
    <table className="legal-table">
      <tr><th>Terceiro</th><th>Função</th><th>Recebe dados pessoais?</th></tr>
      <tr><td>Supabase</td><td>Hospedagem do banco de dados, autenticação e armazenamento de arquivos</td><td>Sim — é quem guarda seus dados de conta</td></tr>
      <tr><td>TMDB</td><td>Fornece informações de filmes e séries (pôsteres, sinopses)</td><td>Não — só recebemos dados públicos de catálogo, não enviamos seus dados pessoais</td></tr>
      <tr><td>Google (Gemini)</td><td>Processa as perguntas feitas ao assistente de IA</td><td>Sim — o texto da sua pergunta é enviado ao provedor de IA</td></tr>
      <tr><td>Google AdSense</td><td>Veiculação de anúncios</td><td>Sim — via cookies próprios, conforme a Política de Cookies</td></tr>
    </table>
    <p>Não vendemos seus dados pessoais a terceiros.</p>

    <h2>5. Base legal e finalidade (LGPD)</h2>
    <p>Tratamos seus dados com base em: execução do contrato de uso do
    serviço (fornecer o site), consentimento (ex: cookies não
    essenciais, biometria) e legítimo interesse (ex: prevenção de
    abuso, segurança).</p>

    <h2>6. Seus direitos</h2>
    <p>De acordo com a LGPD, você pode a qualquer momento:</p>
    <ul>
      <li>Acessar e corrigir seus dados — direto no Painel da Conta</li>
      <li>Solicitar a exclusão da sua conta e dos dados associados</li>
      <li>Revogar consentimentos dados anteriormente (ex: cookies, biometria)</li>
      <li>Solicitar uma cópia dos seus dados (portabilidade)</li>
    </ul>
    <p>Pra exercer qualquer um desses direitos, use o Painel da Conta ou
    entre em contato em
    <a href="mailto:alxmovies.tv@gmail.com">alxmovies.tv@gmail.com</a>.</p>

    <h2>7. Por quanto tempo guardamos seus dados</h2>
    <ul>
      <li>Contas de convidado: até 24 horas após a criação</li>
      <li>Contas normais: enquanto a conta existir, até você solicitar exclusão</li>
    </ul>

    <h2>8. Segurança</h2>
    <p>Detalhamos as medidas técnicas de proteção na nossa
    <Link to="/seguranca">Política de Segurança</Link>.</p>

    <h2>9. Menores de idade</h2>
    <p>A conta principal do ALXmovies deve ser criada por um adulto
    responsável. Perfis infantis (com controle de conteúdo por idade)
    existem justamente pra que crianças usem o serviço sob supervisão
    de quem criou a conta, e não de forma autônoma.</p>

    <h2>10. Alterações nesta política</h2>
    <p>Podemos atualizar esta página conforme o site evolui. A data no
    topo sempre reflete a versão mais recente. Mudanças relevantes serão
    comunicadas por e-mail ou aviso no site.</p>

    <h2>11. Contato</h2>
    <p>Dúvidas sobre esta política ou sobre seus dados:
    <a href="mailto:alxmovies.tv@gmail.com">alxmovies.tv@gmail.com</a></p>
  </div>
      <SiteFooter />
    </>
  );
}
